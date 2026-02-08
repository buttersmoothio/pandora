/**
 * MemoryStore - In-memory conversation history storage
 *
 * Fast, ephemeral storage. Conversations are lost on restart.
 * Useful for development/testing or when persistence isn't needed.
 */

import {
  defineStore,
  type IMessageStore,
  type ConversationInfo,
  type MessageMeta,
  type ChatMessage,
} from "@pandora/core";

interface ConversationMeta {
  channelName?: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

/** Stored message with source channel tracking. */
interface StoredMessage extends ChatMessage {
  channelName?: string;
}

/** In-memory message store. Ephemeral; conversations are lost on restart. */
export class MemoryStore implements IMessageStore {
  private conversations = new Map<string, StoredMessage[]>();
  private metadata = new Map<string, ConversationMeta>();

  /** @inheritdoc */
  async addMessage(
    conversationId: string,
    message: ChatMessage,
    meta?: MessageMeta
  ): Promise<void> {
    const history = this.conversations.get(conversationId) ?? [];
    // Store with source channel for cross-channel tracking
    history.push({ ...message, channelName: meta?.channelName });
    this.conversations.set(conversationId, history);

    const now = Math.floor(Date.now() / 1000);
    const existing = this.metadata.get(conversationId);
    if (!existing) {
      this.metadata.set(conversationId, {
        channelName: meta?.channelName,
        userId: meta?.userId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      existing.updatedAt = now;
    }
  }

  /** @inheritdoc */
  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    // Return only role and content (strip channelName metadata)
    return (this.conversations.get(conversationId) ?? []).map(
      ({ role, content }) => ({ role, content })
    );
  }

  /** @inheritdoc */
  async clearHistory(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
    this.metadata.delete(conversationId);
  }

  /** @inheritdoc */
  async listConversations(channelName?: string): Promise<ConversationInfo[]> {
    const results: ConversationInfo[] = [];
    for (const [id, messages] of this.conversations) {
      const meta = this.metadata.get(id);
      if (channelName && meta?.channelName !== channelName) continue;
      const firstUserMsg = messages.find((m) => m.role === "user");
      results.push({
        id,
        channelName: meta?.channelName ?? null,
        createdAt: meta?.createdAt ?? 0,
        updatedAt: meta?.updatedAt ?? 0,
        preview: firstUserMsg?.content.slice(0, 100) ?? "",
        messageCount: messages.length,
      });
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** @inheritdoc */
  async deleteConversation(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
    this.metadata.delete(conversationId);
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    // No-op for in-memory storage
  }
}

// Self-register the store
export default defineStore({
  type: "memory",
  create: () => new MemoryStore(),
});
