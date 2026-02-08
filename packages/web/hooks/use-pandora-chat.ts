"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus } from "ai";

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  state: "input-available" | "output-available" | "output-error";
}

export interface SourceInfo {
  sourceType: string;
  id: string;
  url?: string;
  title?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  sources?: SourceInfo[];
  reasoning?: string;
}

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

interface UsePandoraChatOptions {
  /** WebSocket URL, e.g. "ws://localhost:3000/ws" */
  url: string;
  /** Auth token (appended as ?token=...) */
  token: string;
  /** Conversation ID to scope messages to */
  conversationId: string;
  /** Called when a conversation is updated from another channel */
  onConversationUpdate?: (conversationId: string) => void;
}

interface UsePandoraChatReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  status: ChatStatus;
  connectionStatus: ConnectionStatus;
  input: string;
  setInput: (value: string) => void;
  sendMessage: (content: string) => void;
  clearConversation: () => void;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function usePandoraChat({
  url,
  token,
  conversationId,
  onConversationUpdate,
}: UsePandoraChatOptions): UsePandoraChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef(conversationId);
  const onConversationUpdateRef = useRef(onConversationUpdate);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Keep refs in sync
  conversationIdRef.current = conversationId;
  onConversationUpdateRef.current = onConversationUpdate;

  // Reset messages and watch the new conversation when it changes
  useEffect(() => {
    setMessages([]);
    streamingIdRef.current = null;
    setStatus("ready");

    // Send watch when WebSocket is open
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "watch", conversationId }));
    }
  }, [conversationId]);

  // Connect WebSocket with reconnection
  useEffect(() => {
    if (!token) return;

    function connect() {
      const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionStatus("connected");
        setStatus("ready");
        // Watch the current conversation for cross-channel events
        ws.send(JSON.stringify({ type: "watch", conversationId: conversationIdRef.current }));
        // Watch all conversations for sidebar updates
        ws.send(JSON.stringify({ type: "watch-all" }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as {
          type: string;
          text?: string;
          content?: string;
          message?: string;
          conversationId?: string;
          channelName?: string;
          toolCallId?: string;
          toolName?: string;
          args?: unknown;
          result?: unknown;
          sourceType?: string;
          id?: string;
          url?: string;
          title?: string;
        };

        // Conversation-scoped check: ignore events for other conversations
        const eventConversationId = data.conversationId;
        const isCurrentConversation =
          !eventConversationId || eventConversationId === conversationIdRef.current;

        switch (data.type) {
          case "conversation-update": {
            onConversationUpdateRef.current?.(data.conversationId ?? "");
            break;
          }
          case "stream-state": {
            // Late-joining: received current state of an active stream
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const state = data as any as {
              conversationId: string;
              channelName: string;
              userContent: string;
              partialText: string;
              toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown; result?: unknown }>;
              sources: Array<{ sourceType: string; id: string; url?: string; title?: string }>;
              reasoning: string;
            };
            if (state.conversationId !== conversationIdRef.current) break;

            const asstId = nextId();
            const asstMsg: ChatMessage = {
              id: asstId,
              role: "assistant",
              content: state.partialText,
              toolCalls: state.toolCalls.map((tc) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args,
                result: tc.result,
                state: tc.result !== undefined ? "output-available" as const : "input-available" as const,
              })),
              sources: state.sources,
              reasoning: state.reasoning || undefined,
            };
            streamingIdRef.current = asstId;
            setMessages((prev) => {
              // Check if history already loaded (has the user message that triggered the stream)
              const lastMsg = prev[prev.length - 1];
              if (lastMsg?.role === "user" && lastMsg.content === state.userContent) {
                // History loaded first - just append the assistant response
                return [...prev, asstMsg];
              }
              // History hasn't loaded yet - add both user message and assistant response
              const userMsg: ChatMessage = {
                id: nextId(),
                role: "user",
                content: state.userContent,
              };
              return [...prev, userMsg, asstMsg];
            });
            setStatus("streaming");
            break;
          }
          case "user-message": {
            if (!isCurrentConversation) break;
            // A message arrived from another channel (e.g. Telegram)
            const userMsg: ChatMessage = {
              id: nextId(),
              role: "user",
              content: data.content ?? "",
            };
            const asstId = nextId();
            const asstMsg: ChatMessage = {
              id: asstId,
              role: "assistant",
              content: "",
            };
            streamingIdRef.current = asstId;
            setMessages((prev) => [...prev, userMsg, asstMsg]);
            setStatus("submitted");
            break;
          }
          case "delta": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id
                  ? { ...msg, content: msg.content + (data.text ?? "") }
                  : msg
              )
            );
            setStatus("streaming");
            break;
          }
          case "tool-call": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            const toolCall: ToolCallInfo = {
              toolCallId: data.toolCallId!,
              toolName: data.toolName!,
              args: data.args,
              state: "input-available",
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id
                  ? { ...msg, toolCalls: [...(msg.toolCalls ?? []), toolCall] }
                  : msg
              )
            );
            break;
          }
          case "tool-result": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id
                  ? {
                      ...msg,
                      toolCalls: msg.toolCalls?.map((tc) =>
                        tc.toolCallId === data.toolCallId
                          ? {
                              ...tc,
                              result: data.result,
                              state: "output-available" as const,
                            }
                          : tc
                      ),
                    }
                  : msg
              )
            );
            break;
          }
          case "source": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id
                  ? {
                      ...msg,
                      sources: [
                        ...(msg.sources ?? []),
                        { sourceType: data.sourceType!, id: data.id!, url: data.url, title: data.title },
                      ],
                    }
                  : msg
              )
            );
            break;
          }
          case "reasoning-delta": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id
                  ? { ...msg, reasoning: (msg.reasoning ?? "") + (data.text ?? "") }
                  : msg
              )
            );
            break;
          }
          case "done": {
            if (!isCurrentConversation) break;
            streamingIdRef.current = null;
            setStatus("ready");
            break;
          }
          case "cleared": {
            if (data.conversationId === conversationIdRef.current) {
              setMessages([]);
            }
            setStatus("ready");
            break;
          }
          case "error": {
            streamingIdRef.current = null;
            setStatus("error");
            break;
          }
        }
      };

      ws.onclose = () => {
        if (intentionalCloseRef.current) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so reconnect is handled there
      };
    }

    function scheduleReconnect() {
      if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus("disconnected");
        return;
      }
      setConnectionStatus("reconnecting");
      const delay = Math.min(BASE_DELAY * 2 ** reconnectAttemptRef.current, MAX_DELAY);
      reconnectAttemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    intentionalCloseRef.current = false;
    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [url, token]);

  const sendMessage = useCallback(
    (content: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !content.trim()) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content: content.trim(),
      };

      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };

      streamingIdRef.current = assistantId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus("submitted");

      ws.send(
        JSON.stringify({
          type: "message",
          content: content.trim(),
          conversationId: conversationIdRef.current,
        })
      );
    },
    []
  );

  const clearConversation = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "clear",
        conversationId: conversationIdRef.current,
      })
    );
  }, []);

  return {
    messages,
    setMessages,
    status,
    connectionStatus,
    input,
    setInput,
    sendMessage,
    clearConversation,
  };
}
