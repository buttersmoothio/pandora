/**
 * MemoryStore - In-memory conversation history storage
 *
 * Fast, ephemeral storage. Conversations are lost on restart.
 * Useful for development/testing or when persistence isn't needed.
 */

import type { ChatMessage } from "../core/types";
import type { IMessageStore } from "./types";

export class MemoryStore implements IMessageStore {
  private conversations = new Map<string, ChatMessage[]>();

  async addMessage(
    conversationId: string,
    message: ChatMessage
  ): Promise<void> {
    const history = this.conversations.get(conversationId) ?? [];
    history.push(message);
    this.conversations.set(conversationId, history);
  }

  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    return this.conversations.get(conversationId) ?? [];
  }

  async clearHistory(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
  }

  async close(): Promise<void> {
    // Nothing to clean up for in-memory storage
  }
}
