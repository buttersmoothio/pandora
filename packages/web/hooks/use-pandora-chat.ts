"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus } from "ai";
import { generateId } from "ai";
import {
  createPartFromEvent,
  appendTextDelta,
  appendReasoningDelta,
  updateToolResult,
  appendPart,
  finalizeParts,
} from "@/lib/message-utils";

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
  | {
      type: "memory-context";
      facts: Array<{ content: string; category?: string; score: number }>;
      episodes: Array<{ content: string; timestamp?: number; score: number }>;
    };

export type PandoraMessage = {
  id: string;
  role: "user" | "assistant";
  parts: PandoraMessagePart[];
  /** Channel this message originated from (for cross-channel visibility) */
  channelName?: string;
  /** Token usage for this message (persisted) */
  usage?: TokenUsage;
};

/** State for an active subagent thread */
export interface SubagentThread {
  threadId: string;
  toolCallId: string;
  subagentName: string;
  messages: PandoraMessage[];
  status: "loading" | "streaming" | "done";
}

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

/** Token usage for a response */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Context health status */
export interface ContextHealth {
  usedTokens: number;
  remainingTokens: number;
  percentUsed: number;
  isHealthy: boolean;
  shouldCompact: boolean;
  tokensToRemove: number;
}

/** Context limits */
export interface ContextLimits {
  input: number;
  output: number;
  total: number;
}

/** Token costs (matches tokenlens TokenCosts format) */
export interface TokenCosts {
  inputTokenCostUSD: number;
  outputTokenCostUSD: number;
  reasoningTokenCostUSD: number | null;
  cacheReadTokenCostUSD: number | null;
  cacheWriteTokenCostUSD: number | null;
  totalTokenCostUSD: number;
}

/** Context state for an agent */
export interface ContextState {
  modelId: string;
  limits: ContextLimits;
  health: ContextHealth;
  costs: TokenCosts;
  lastTurn?: TokenUsage;
}

/** Conversation stats (aggregated across operator + subagents) */
export interface ConversationStats {
  operator: ContextState;
  subagents: Record<string, ContextState>;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

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
  /** Set threads (for loading from history) */
  setThreads: React.Dispatch<React.SetStateAction<Map<string, SubagentThread>>>;
  /** Token usage for the current/last response */
  usage: TokenUsage | null;
  /** Current context state (null if context management not enabled) */
  contextState: ContextState | null;
  /** Conversation stats (updated after each turn) */
  conversationStats: ConversationStats | null;
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
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [contextState, setContextState] = useState<ContextState | null>(null);
  const [conversationStats, setConversationStats] = useState<ConversationStats | null>(null);
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
    setUsage(null);
    setContextState(null);
    setConversationStats(null);
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
          usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
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
          case "tool-call": {
            if (!isCurrentConversation) break;
            const part = createPartFromEvent("tool-call", data as Record<string, unknown>);
            if (part) {
              setMessages((prev) => {
                // Prefer streaming message, fallback to last assistant message
                const targetId = streamingIdRef.current ??
                  [...prev].reverse().find((m) => m.role === "assistant")?.id;
                if (!targetId) return prev;
                return prev.map((msg) => msg.id === targetId ? appendPart(msg, part) : msg);
              });
            }
            break;
          }
          case "tool-result": {
            if (!isCurrentConversation) break;
            // Update tool result in any message that contains this toolCallId
            // (don't require streamingIdRef - may be watching cross-channel)
            setMessages((prev) =>
              prev.map((msg) => {
                const hasTool = msg.parts.some(
                  (p) => p.type === "dynamic-tool" && p.toolCallId === data.toolCallId
                );
                return hasTool
                  ? updateToolResult(msg, data.toolCallId!, data.result, data.threadId)
                  : msg;
              })
            );
            break;
          }
          case "source-url":
          case "source-document":
          case "file": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            const part = createPartFromEvent(data.type, data as Record<string, unknown>);
            if (part) {
              setMessages((prev) =>
                prev.map((msg) => msg.id === id ? appendPart(msg, part) : msg)
              );
            }
            break;
          }
          case "memory-context": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;

            const part: PandoraMessagePart = {
              type: "memory-context",
              facts: (data as { facts?: Array<{ content: string; category?: string; score: number }> }).facts ?? [],
              episodes: (data as { episodes?: Array<{ content: string; timestamp?: number; score: number }> }).episodes ?? [],
            };
            setMessages((prev) =>
              prev.map((msg) => msg.id === id ? appendPart(msg, part) : msg)
            );
            break;
          }
          case "reasoning-delta": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            if (!id) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === id ? appendReasoningDelta(msg, data.text ?? "") : msg
              )
            );
            break;
          }
          case "step-finish": {
            if (!isCurrentConversation) break;
            const id = streamingIdRef.current;
            // Accumulate token usage across steps
            if (data.usage) {
              const delta = {
                inputTokens: data.usage.inputTokens ?? 0,
                outputTokens: data.usage.outputTokens ?? 0,
                totalTokens: data.usage.totalTokens ?? 0,
              };
              // Update current response usage state (for live display)
              setUsage((prev) => ({
                inputTokens: (prev?.inputTokens ?? 0) + delta.inputTokens,
                outputTokens: (prev?.outputTokens ?? 0) + delta.outputTokens,
                totalTokens: (prev?.totalTokens ?? 0) + delta.totalTokens,
              }));
              // Also update the message's usage field (for persistence)
              if (id) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === id
                      ? {
                          ...msg,
                          usage: {
                            inputTokens: (msg.usage?.inputTokens ?? 0) + delta.inputTokens,
                            outputTokens: (msg.usage?.outputTokens ?? 0) + delta.outputTokens,
                            totalTokens: (msg.usage?.totalTokens ?? 0) + delta.totalTokens,
                          },
                        }
                      : msg
                  )
                );
              }
            }
            break;
          }
          case "done": {
            if (!isCurrentConversation) break;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingIdRef.current ? finalizeParts(msg) : msg
              )
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
          case "context-state": {
            if (!isCurrentConversation) break;
            const stateData = data as unknown as { state: ContextState };
            if (stateData.state) {
              setContextState(stateData.state);
            }
            break;
          }
          case "conversation-stats": {
            if (!isCurrentConversation) break;
            const statsData = data as unknown as { stats: ConversationStats };
            if (statsData.stats) {
              setConversationStats(statsData.stats);
            }
            break;
          }
          case "compaction": {
            // Compaction event - could show a notification or update UI
            // For now, we just log it - the history will be refreshed
            if (!isCurrentConversation) break;
            console.log("[Compaction]", data);
            break;
          }
          case "subagent-start": {
            if (!isCurrentConversation) break;
            const { threadId, toolCallId, subagentName } = data;
            if (!threadId || !toolCallId || !subagentName) break;

            // Update the tool part with threadId so it becomes clickable
            // (search all messages - may be watching cross-channel)
            setMessages((prev) =>
              prev.map((msg) => {
                const hasTool = msg.parts.some(
                  (p) => p.type === "dynamic-tool" && p.toolCallId === toolCallId
                );
                if (!hasTool) return msg;
                return {
                  ...msg,
                  parts: msg.parts.map((part) =>
                    part.type === "dynamic-tool" && part.toolCallId === toolCallId
                      ? { ...part, threadId }
                      : part
                  ),
                };
              })
            );

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
              next.set(threadId, {
                ...thread,
                messages: thread.messages.map(finalizeParts),
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
              setThreads((prev) => updateThreadLastMessage(prev, threadId, (msg) =>
                appendTextDelta(msg, text)
              ));
            } else {
              // Operator text delta
              const id = streamingIdRef.current;
              if (!id) break;
              setMessages((prev) =>
                prev.map((msg) => msg.id === id ? appendTextDelta(msg, text) : msg)
              );
              setStatus("streaming");
            }
            break;
          }
        }

        // Handle events with threadId routing to subagent threads
        // (tool-call, tool-result, source-url, etc. when they have threadId)
        if (data.threadId && data.type !== "subagent-start" && data.type !== "subagent-done" && data.type !== "text-delta") {
          const { threadId } = data;

          if (data.type === "tool-result") {
            // Special case: update existing tool part
            setThreads((prev) => updateThreadLastMessage(prev, threadId, (msg) =>
              updateToolResult(msg, data.toolCallId!, data.result)
            ));
          } else if (data.type === "reasoning-delta") {
            // Special case: append to reasoning
            setThreads((prev) => updateThreadLastMessage(prev, threadId, (msg) =>
              appendReasoningDelta(msg, data.text ?? "")
            ));
          } else {
            // All other events: create and append part
            const newPart = createPartFromEvent(data.type, data as Record<string, unknown>);
            if (newPart) {
              setThreads((prev) => updateThreadLastMessage(prev, threadId, (msg) =>
                appendPart(msg, newPart)
              ));
            }
          }
        }
      };

      // Helper to update the last message in a thread
      function updateThreadLastMessage(
        threads: Map<string, SubagentThread>,
        threadId: string,
        updater: (msg: PandoraMessage) => PandoraMessage
      ): Map<string, SubagentThread> {
        const thread = threads.get(threadId);
        if (!thread) return threads;

        const lastMsg = thread.messages[thread.messages.length - 1];
        if (!lastMsg || lastMsg.role !== "assistant") return threads;

        const next = new Map(threads);
        const updatedMessages = [...thread.messages];
        updatedMessages[updatedMessages.length - 1] = updater(lastMsg);
        next.set(threadId, { ...thread, messages: updatedMessages });
        return next;
      }

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
      setUsage(null); // Reset usage for new response
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
    setThreads,
    usage,
    contextState,
    conversationStats,
  };
}
