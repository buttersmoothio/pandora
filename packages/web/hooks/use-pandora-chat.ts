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

interface UsePandoraChatOptions {
  /** WebSocket URL, e.g. "ws://localhost:3000/ws" */
  url: string;
  /** Auth token (appended as ?token=...) */
  token: string;
  /** Conversation ID to scope messages to */
  conversationId: string;
}

interface UsePandoraChatReturn {
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  status: ChatStatus;
  input: string;
  setInput: (value: string) => void;
  sendMessage: (content: string) => void;
  clearConversation: () => void;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

export function usePandoraChat({
  url,
  token,
  conversationId,
}: UsePandoraChatOptions): UsePandoraChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef(conversationId);

  // Keep ref in sync
  conversationIdRef.current = conversationId;

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

  // Connect WebSocket
  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("ready");
      // Watch the current conversation for cross-channel events
      ws.send(JSON.stringify({ type: "watch", conversationId: conversationIdRef.current }));
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

      switch (data.type) {
        case "user-message": {
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
      setStatus("error");
    };

    ws.onerror = () => {
      setStatus("error");
    };

    return () => {
      ws.close();
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
    input,
    setInput,
    sendMessage,
    clearConversation,
  };
}
