/**
 * Store Registry - Framework infrastructure for registering storage backends
 *
 * Storage backends persist conversation history (memory, SQLite, etc.).
 * Each backend is defined in src/store/ and self-registers using defineStore().
 */

import type { ChatMessage } from "../types";
import type { StorageConfig } from "../config";

/** Summary information about a stored conversation. */
export interface ConversationInfo {
  id: string;
  /** Channel that created this conversation */
  channelName: string | null;
  /** Unix epoch seconds */
  createdAt: number;
  /** Unix epoch seconds */
  updatedAt: number;
  /** First user message, truncated */
  preview: string;
  /** Total number of messages */
  messageCount: number;
}

/** Optional metadata passed when storing messages. */
export interface MessageMeta {
  channelName?: string;
  userId?: string;
}

/**
 * Storage interface for message persistence.
 *
 * All backends (memory, SQLite, Postgres, etc.) implement this interface.
 * Methods are async to support both in-memory and persistent backends.
 */
export interface IMessageStore {
  /** Add a message to a conversation's history */
  addMessage(
    conversationId: string,
    message: ChatMessage,
    meta?: MessageMeta
  ): Promise<void>;

  /** Get the full conversation history for a conversation */
  getHistory(conversationId: string): Promise<ChatMessage[]>;

  /** Clear all messages in a conversation */
  clearHistory(conversationId: string): Promise<void>;

  /** List conversations, optionally filtered by channel name. Ordered by most recently updated. */
  listConversations(channelName?: string): Promise<ConversationInfo[]>;

  /** Delete a conversation and all its messages. */
  deleteConversation(conversationId: string): Promise<void>;

  /** Gracefully close the store (flush writes, release connections, etc.) */
  close(): Promise<void>;
}

/**
 * Factory definition for a storage backend.
 * Each store file exports a definition using defineStore().
 */
export interface StoreFactory {
  /** Storage type identifier (matches config.storage.type) */
  type: string;
  /** Create the store instance */
  create: (config: StorageConfig) => IMessageStore;
}

/** Registry of all store factories */
const registry = new Map<string, StoreFactory>();

/**
 * Register a store factory.
 * Call this from each store file to self-register.
 *
 * @param factory - The store factory definition
 * @returns The same factory (for export convenience)
 */
export function defineStore(factory: StoreFactory): StoreFactory {
  registry.set(factory.type, factory);
  return factory;
}

/**
 * Get all registered store types.
 */
export function getAvailableStoreTypes(): string[] {
  return Array.from(registry.keys());
}

/**
 * Create a message store from storage config.
 *
 * @param config - Storage config (type, path, etc.)
 * @returns Store instance implementing IMessageStore
 * @throws {Error} If config.type is not registered
 */
export function createStore(config: StorageConfig): IMessageStore {
  const factory = registry.get(config.type);

  if (!factory) {
    const available = getAvailableStoreTypes().join(", ");
    throw new Error(
      `Unknown store type: "${config.type}". Available types: ${available || "none registered"}`
    );
  }

  return factory.create(config);
}
