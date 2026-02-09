"use client";

import { useCallback, useEffect, useState } from "react";
import type { PandoraMessage, PandoraMessagePart } from "./use-pandora-chat";

export interface ConversationInfo {
  id: string;
  channelName: string | null;
  createdAt: number;
  updatedAt: number;
  preview: string;
  messageCount: number;
  /** Conversation type: 'root' for top-level, 'subagent' for child threads */
  type?: "root" | "subagent";
  /** Parent conversation ID (for subagent threads) */
  parentConversationId?: string;
  /** Tool call ID that spawned this thread (for subagent threads) */
  parentToolCallId?: string;
  /** Subagent name (for subagent threads) */
  subagentName?: string;
}

interface UseConversationsOptions {
  /** HTTP base URL, e.g. "http://localhost:3000" */
  baseUrl: string;
  /** Auth token */
  token: string;
}

interface UseConversationsReturn {
  conversations: ConversationInfo[];
  loading: boolean;
  refresh: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  loadHistory: (id: string) => Promise<PandoraMessage[]>;
  /** Load a single thread's messages by threadId */
  loadThread: (threadId: string) => Promise<PandoraMessage[]>;
}

export function useConversations({
  baseUrl,
  token,
}: UseConversationsOptions): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/conversations`, { headers });
      if (res.ok) {
        const data = (await res.json()) as { conversations: ConversationInfo[] };
        setConversations(data.conversations);
      }
    } catch {
      // silently fail — backend may be unreachable
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    },
    [baseUrl, token]
  );

  const loadHistory = useCallback(
    async (id: string): Promise<PandoraMessage[]> => {
      const res = await fetch(
        `${baseUrl}/api/conversations/${encodeURIComponent(id)}/history`,
        { headers }
      );
      if (!res.ok) return [];

      // API returns UIMessage[] with parts-based storage (including channelName)
      const data = (await res.json()) as {
        messages: Array<{
          id: string;
          role: "user" | "assistant";
          parts: PandoraMessagePart[];
          channelName?: string;
        }>;
      };

      // Return messages directly - they're already in the right format
      return data.messages;
    },
    [baseUrl, token]
  );

  const loadThread = useCallback(
    async (threadId: string): Promise<PandoraMessage[]> => {
      const res = await fetch(
        `${baseUrl}/api/conversations/${encodeURIComponent(threadId)}/history`,
        { headers }
      );
      if (!res.ok) return [];

      const data = (await res.json()) as { messages: PandoraMessage[] };
      return data.messages;
    },
    [baseUrl, token]
  );

  // Auto-fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { conversations, loading, refresh, deleteConversation, loadHistory, loadThread };
}
