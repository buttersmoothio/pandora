/**
 * Storage interface for message persistence.
 *
 * All backends (memory, SQLite, Postgres, etc.) implement this interface.
 * Methods are async to support both in-memory and persistent backends.
 */

import type { ChatMessage } from "../core/types";

export interface IMessageStore {
  /** Add a message to a conversation's history */
  addMessage(conversationId: string, message: ChatMessage): Promise<void>;

  /** Get the full conversation history for a conversation */
  getHistory(conversationId: string): Promise<ChatMessage[]>;

  /** Clear all messages in a conversation */
  clearHistory(conversationId: string): Promise<void>;

  /** Gracefully close the store (flush writes, release connections, etc.) */
  close(): Promise<void>;
}
