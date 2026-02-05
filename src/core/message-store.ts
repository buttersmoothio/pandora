/**
 * MessageStore - In-memory conversation history storage
 *
 * Interface designed to be swappable with persistent storage later.
 */

import type { ChatMessage } from "./types.ts";

/**
 * Interface for message storage implementations.
 * All methods are async to support future persistent backends.
 */
export interface IMessageStore {
  addMessage(conversationId: string, message: ChatMessage): Promise<void>;
  getHistory(conversationId: string): Promise<ChatMessage[]>;
  clearHistory(conversationId: string): Promise<void>;
}

/**
 * In-memory implementation of MessageStore.
 * Stores conversations in a Map for fast access.
 */
export class MessageStore implements IMessageStore {
  private conversations = new Map<string, ChatMessage[]>();

  /**
   * Add a message to a conversation's history
   */
  async addMessage(
    conversationId: string,
    message: ChatMessage
  ): Promise<void> {
    const history = this.conversations.get(conversationId) ?? [];
    history.push(message);
    this.conversations.set(conversationId, history);
  }

  /**
   * Get the full conversation history for a conversation
   */
  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    return this.conversations.get(conversationId) ?? [];
  }

  /**
   * Clear all messages in a conversation
   */
  async clearHistory(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
  }

  /**
   * Get all conversation IDs (useful for debugging/admin)
   */
  getConversationIds(): string[] {
    return Array.from(this.conversations.keys());
  }

  /**
   * Get total message count across all conversations
   */
  getTotalMessageCount(): number {
    let total = 0;
    for (const messages of this.conversations.values()) {
      total += messages.length;
    }
    return total;
  }
}
