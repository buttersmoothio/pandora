"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "./use-pandora-chat";

export interface ConversationInfo {
  id: string;
  channelName: string | null;
  createdAt: number;
  updatedAt: number;
  preview: string;
  messageCount: number;
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
  loadHistory: (id: string) => Promise<ChatMessage[]>;
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
    async (id: string): Promise<ChatMessage[]> => {
      const res = await fetch(
        `${baseUrl}/api/conversations/${encodeURIComponent(id)}/history`,
        { headers }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        messages: { role: "user" | "assistant"; content: string }[];
      };
      let counter = 0;
      return data.messages.map((m) => ({
        id: `hist-${++counter}`,
        role: m.role,
        content: m.content,
      }));
    },
    [baseUrl, token]
  );

  // Auto-fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { conversations, loading, refresh, deleteConversation, loadHistory };
}
