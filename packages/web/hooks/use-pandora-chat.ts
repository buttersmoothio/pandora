"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus, UIMessage, UIMessagePart } from "ai";
import { generateId } from "ai";

/**
 * Extended UIMessagePart types for Pandora.
 * These match the parts stored in the backend.
 */
export type PandoraMessagePart =
  | { type: "text"; text: string; state?: "streaming" | "done" }
  | { type: "reasoning"; text: string; state?: "streaming" | "done" }
  | { type: "dynamic-tool"; toolName: string; toolCallId: string; state: "input-available" | "output-available" | "output-error"; input?: unknown; output?: unknown; threadId?: string }
  | { type: "source-url"; sourceId: string; url: string; title?: string }
  | { type: "source-document"; sourceId: string; mediaType: string; title: string; filename?: string }
  | { type: "file"; mediaType: string; url: string; filename?: string }
  | { type: "step-start" };

export type PandoraMessage = {
  id: string;
  role: "user" | "assistant";
  parts: PandoraMessagePart[];
  /** Channel this message originated from (for cross-channel visibility) */
  channelName?: string;
};

/** State for an active subagent thread */
export interface SubagentThread {
  threadId: string;
  toolCallId: string;
  subagentName: string;
  messages: PandoraMessage[];
  status: "streaming" | "done";
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
  messages: PandoraMessage[];
  setMessages: React.Dispatch<React.SetStateAction<PandoraMessage[]>>;
  status: ChatStatus;
  connectionStatus: ConnectionStatus;
  input: string;
  setInput: (value: string) => void;
  sendMessage: (content: string) => void;
  clearConversation: () => void;
  /** Subscribe to live updates for the current conversation */
  sendWatch: () => void;
  /** Active subagent threads (keyed by threadId) */
  threads: Map<string, SubagentThread>;
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
  const [messages, setMessages] = useState<PandoraMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [input, setInput] = useState("");
  const [threads, setThreads] = useState<Map<string, SubagentThread>>(new Map());
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

  // Reset state when conversation changes (watch is sent manually after history loads)
  useEffect(() => {
    setMessages([]);
    setThreads(new Map());
    streamingIdRef.current = null;
    setStatus("ready");
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
          sourceId?: string;
          url?: string;
          title?: string;
          mediaType?: string;
          filename?: string;
          threadId?: string;
          subagentName?: string;
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
            // Late-joining: mark the last assistant message as streaming.
            // History (loaded separately) already contains the in-progress messages.
            // We just need to identify which message to update with future events.
            if (streamingIdRef.current) break;

            const state = data as unknown as {
              conversationId: string;
            };
            if (state.conversationId !== conversationIdRef.current) break;

            // Find the last assistant message and mark it as streaming.
            // Use flushSync-like pattern: capture from current state.
            let foundStreamingId: string | null = null;
            setMessages((prev) => {
              const lastAsst = [...prev].reverse().find((m) => m.role === "assistant");
              if (lastAsst) {
                foundStreamingId = lastAsst.id;
                streamingIdRef.current = lastAsst.id;
              }
              return prev; // Don't modify messages - history already has them
            });
            if (foundStreamingId) {
              setStatus("streaming");
            }
            break;
          }
          case "user-message": {
            if (!isCurrentConversation) break;
            // Skip if we're already processing (we sent this message ourselves)
            // This is for cross-channel watching only
            if (streamingIdRef.current) break;

            const userMsg: PandoraMessage = {
              id: generateId(),
              role: "user",
              parts: [{ type: "text", text: data.content ?? "", state: "done" }],
              channelName: data.channelName,
            };
            const asstId = generateId();
            const asstMsg: PandoraMessage = {
              id: asstId,
              role: "assistant",
              parts: [],
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
              prev.map((msg) => {
                if (msg.id !== id) return msg;
                const parts = [...msg.parts];
                const lastPart = parts[parts.length - 1];
                if (lastPart?.type === "text") {
                  // Append to existing text part
                  parts[parts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + (data.text ?? ""),
                  };
                } else {
                  // Create new text part
                  parts.push({ type: "text", text: data.text ?? "", state: "streaming" });
                }
                return { ...msg, parts };
              })
            );
            setStatus("streaming");
            break;
          }
          case "tool-call": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            const toolPart: PandoraMessagePart = {
              type: "dynamic-tool",
              toolName: data.toolName!,
              toolCallId: data.toolCallId!,
              state: "input-available",
              input: data.args,
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id ? { ...msg, parts: [...msg.parts, toolPart] } : msg
              )
            );
            break;
          }
          case "tool-result": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== id) return msg;
                return {
                  ...msg,
                  parts: msg.parts.map((part) =>
                    part.type === "dynamic-tool" && part.toolCallId === data.toolCallId
                      ? { ...part, state: "output-available" as const, output: data.result, threadId: data.threadId }
                      : part
                  ),
                };
              })
            );
            break;
          }
          case "source-url": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            const sourcePart: PandoraMessagePart = {
              type: "source-url",
              sourceId: data.sourceId ?? generateId(),
              url: data.url ?? "",
              title: data.title,
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id ? { ...msg, parts: [...msg.parts, sourcePart] } : msg
              )
            );
            break;
          }
          case "source-document": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            const sourcePart: PandoraMessagePart = {
              type: "source-document",
              sourceId: data.sourceId ?? generateId(),
              mediaType: data.mediaType ?? "",
              title: data.title ?? "",
              filename: data.filename,
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id ? { ...msg, parts: [...msg.parts, sourcePart] } : msg
              )
            );
            break;
          }
          case "file": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            const filePart: PandoraMessagePart = {
              type: "file",
              mediaType: data.mediaType ?? "",
              url: data.url ?? "",
              filename: data.filename,
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id ? { ...msg, parts: [...msg.parts, filePart] } : msg
              )
            );
            break;
          }
          case "reasoning-delta": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== id) return msg;
                const parts = [...msg.parts];
                const reasoningIdx = parts.findIndex((p) => p.type === "reasoning");
                if (reasoningIdx >= 0) {
                  const existing = parts[reasoningIdx] as { type: "reasoning"; text: string };
                  parts[reasoningIdx] = { ...existing, text: existing.text + (data.text ?? "") };
                } else {
                  parts.unshift({ type: "reasoning", text: data.text ?? "", state: "streaming" });
                }
                return { ...msg, parts };
              })
            );
            break;
          }
          case "step-start": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id ? { ...msg, parts: [...msg.parts, { type: "step-start" }] } : msg
              )
            );
            break;
          }
          case "done": {
            if (!isCurrentConversation) break;
            // Finalize text parts
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== streamingIdRef.current) return msg;
                return {
                  ...msg,
                  parts: msg.parts.map((part) =>
                    part.type === "text" || part.type === "reasoning"
                      ? { ...part, state: "done" as const }
                      : part
                  ),
                };
              })
            );
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
          case "subagent-start": {
            if (!isCurrentConversation) break;
            const { threadId, toolCallId, subagentName } = data;
            if (!threadId || !toolCallId || !subagentName) break;

            // Create a new thread with initial assistant message
            const asstId = generateId();
            setThreads((prev) => {
              const next = new Map(prev);
              next.set(threadId, {
                threadId,
                toolCallId,
                subagentName,
                messages: [
                  { id: asstId, role: "assistant", parts: [] },
                ],
                status: "streaming",
              });
              return next;
            });
            break;
          }
          case "subagent-done": {
            if (!isCurrentConversation) break;
            const { threadId } = data;
            if (!threadId) break;

            setThreads((prev) => {
              const thread = prev.get(threadId);
              if (!thread) return prev;

              const next = new Map(prev);
              // Finalize text parts in the thread
              const finalizedMessages = thread.messages.map((msg) => ({
                ...msg,
                parts: msg.parts.map((part) =>
                  part.type === "text" || part.type === "reasoning"
                    ? { ...part, state: "done" as const }
                    : part
                ),
              }));
              next.set(threadId, {
                ...thread,
                messages: finalizedMessages,
                status: "done",
              });
              return next;
            });
            break;
          }
          case "text-delta": {
            if (!isCurrentConversation) break;
            const { threadId, text } = data;
            if (!text) break;

            if (threadId) {
              // Route to subagent thread
              setThreads((prev) => {
                const thread = prev.get(threadId);
                if (!thread) return prev;

                const next = new Map(prev);
                const lastMsg = thread.messages[thread.messages.length - 1];
                if (!lastMsg || lastMsg.role !== "assistant") return prev;

                const parts = [...lastMsg.parts];
                const lastPart = parts[parts.length - 1];
                if (lastPart?.type === "text") {
                  parts[parts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + text,
                  };
                } else {
                  parts.push({ type: "text", text, state: "streaming" });
                }

                const updatedMessages = [...thread.messages];
                updatedMessages[updatedMessages.length - 1] = { ...lastMsg, parts };

                next.set(threadId, { ...thread, messages: updatedMessages });
                return next;
              });
            }
            // Note: operator text deltas still come via the "delta" event
            break;
          }
        }

        // Handle events with threadId routing to subagent threads
        // (tool-call, tool-result, source-url, etc. when they have threadId)
        if (data.threadId && data.type !== "subagent-start" && data.type !== "subagent-done" && data.type !== "text-delta") {
          const { threadId } = data;

          setThreads((prev) => {
            const thread = prev.get(threadId);
            if (!thread) return prev;

            const next = new Map(prev);
            const lastMsg = thread.messages[thread.messages.length - 1];
            if (!lastMsg || lastMsg.role !== "assistant") return prev;

            let newPart: PandoraMessagePart | null = null;

            switch (data.type) {
              case "tool-call":
                newPart = {
                  type: "dynamic-tool",
                  toolName: data.toolName!,
                  toolCallId: data.toolCallId!,
                  state: "input-available",
                  input: data.args,
                };
                break;
              case "tool-result": {
                // Update existing tool part in thread
                const updatedParts = lastMsg.parts.map((part) =>
                  part.type === "dynamic-tool" && part.toolCallId === data.toolCallId
                    ? { ...part, state: "output-available" as const, output: data.result }
                    : part
                );
                const updatedMessages = [...thread.messages];
                updatedMessages[updatedMessages.length - 1] = { ...lastMsg, parts: updatedParts };
                next.set(threadId, { ...thread, messages: updatedMessages });
                return next;
              }
              case "source-url":
                newPart = {
                  type: "source-url",
                  sourceId: data.sourceId ?? generateId(),
                  url: data.url ?? "",
                  title: data.title,
                };
                break;
              case "source-document":
                newPart = {
                  type: "source-document",
                  sourceId: data.sourceId ?? generateId(),
                  mediaType: data.mediaType ?? "",
                  title: data.title ?? "",
                  filename: data.filename,
                };
                break;
              case "reasoning-delta": {
                const parts = [...lastMsg.parts];
                const reasoningIdx = parts.findIndex((p) => p.type === "reasoning");
                if (reasoningIdx >= 0) {
                  const existing = parts[reasoningIdx] as { type: "reasoning"; text: string };
                  parts[reasoningIdx] = { ...existing, text: existing.text + (data.text ?? "") };
                } else {
                  parts.unshift({ type: "reasoning", text: data.text ?? "", state: "streaming" });
                }
                const updatedMessages = [...thread.messages];
                updatedMessages[updatedMessages.length - 1] = { ...lastMsg, parts };
                next.set(threadId, { ...thread, messages: updatedMessages });
                return next;
              }
            }

            if (newPart) {
              const updatedMessages = [...thread.messages];
              updatedMessages[updatedMessages.length - 1] = {
                ...lastMsg,
                parts: [...lastMsg.parts, newPart],
              };
              next.set(threadId, { ...thread, messages: updatedMessages });
            }

            return next;
          });
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

      const userMsg: PandoraMessage = {
        id: generateId(),
        role: "user",
        parts: [{ type: "text", text: content.trim(), state: "done" }],
      };

      const assistantId = generateId();
      const assistantMsg: PandoraMessage = {
        id: assistantId,
        role: "assistant",
        parts: [],
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

  const sendWatch = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "watch", conversationId: conversationIdRef.current }));
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
    sendWatch,
    threads,
  };
}
