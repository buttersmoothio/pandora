/**
 * MemoryStore - In-memory conversation history storage
 *
 * Fast, ephemeral storage. Conversations are lost on restart.
 * Useful for development/testing or when persistence isn't needed.
 */

import type { ChatMessage } from "../core/types";
import type { IMessageStore } from "./types";

/** In-memory message store. Ephemeral; conversations are lost on restart. */
export class MemoryStore implements IMessageStore {
  private conversations = new Map<string, ChatMessage[]>();

  /** @inheritdoc */
  async addMessage(
    conversationId: string,
    message: ChatMessage
  ): Promise<void> {
    const history = this.conversations.get(conversationId) ?? [];
    history.push(message);
    this.conversations.set(conversationId, history);
  }

  /** @inheritdoc */
  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    return this.conversations.get(conversationId) ?? [];
  }

  /** @inheritdoc */
  async clearHistory(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    // No-op for in-memory storage
  }
}
