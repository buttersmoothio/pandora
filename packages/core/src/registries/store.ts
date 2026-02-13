/**
 * Store Registry - Framework infrastructure for registering storage backends
 *
 * Storage backends persist conversation history (memory, SQLite, etc.).
 * Each backend is defined in src/store/ and self-registers using defineStore().
 */

import type { UIMessage, PandoraMessagePart, MessageMeta } from "../types";
import type { StorageConfig } from "../config";
import { logger } from "../logger";

// ============================================================================
// Token Usage Types
// ============================================================================

/** Extended token usage for storage (includes cache and reasoning tokens) */
export interface StoredUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

/** Aggregated usage across all messages in a conversation */
export interface ConversationUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  messageCount: number;
}

// Re-export MessageMeta for convenience
export type { MessageMeta } from "../types";

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
  /** Conversation type: 'root' for top-level, 'subagent' for child threads */
  type?: "root" | "subagent";
  /** Parent conversation ID (for subagent threads) */
  parentConversationId?: string;
  /** Tool call ID that spawned this thread (for subagent threads) */
  parentToolCallId?: string;
  /** Subagent name (for subagent threads) */
  subagentName?: string;
}

/**
 * Storage interface for message persistence.
 *
 * All backends (memory, SQLite, Postgres, etc.) implement this interface.
 * Methods are async to support both in-memory and persistent backends.
 *
 * Supports streaming persistence: messages are created first, then parts
 * are appended incrementally as they stream in.
 */
export interface IMessageStore {
  // === Message Management ===

  /**
   * Add a complete message to a conversation's history.
   * For non-streaming use cases or when message is already complete.
   * @returns The generated message ID
   */
  addMessage(
    conversationId: string,
    message: Omit<UIMessage, "id">,
    meta?: MessageMeta
  ): Promise<string>;

  /** Get the full conversation history for a conversation */
  getHistory(conversationId: string): Promise<UIMessage[]>;

  /**
   * Replace entire conversation history with new messages.
   * Used by compaction to replace old messages with summary + recent messages.
   */
  replaceHistory(conversationId: string, messages: UIMessage[]): Promise<void>;

  /** Clear all messages in a conversation */
  clearHistory(conversationId: string): Promise<void>;

  // === Streaming Persistence ===

  /**
   * Create a new message shell before streaming begins.
   * @returns The generated message ID
   */
  createMessage(
    conversationId: string,
    role: "user" | "assistant",
    meta?: MessageMeta
  ): Promise<string>;

  /**
   * Append a part to an existing message.
   * For text parts, this creates a new text part with state: "streaming".
   */
  appendPart(messageId: string, part: PandoraMessagePart): Promise<void>;

  /**
   * Update a tool part with its result (state: input-available -> output-available).
   */
  updateToolResult(
    messageId: string,
    toolCallId: string,
    result: unknown
  ): Promise<void>;

  /**
   * Update the last text part with new content.
   * Used during streaming to accumulate text.
   */
  updateTextPart(messageId: string, text: string): Promise<void>;

  /**
   * Finalize a message (text part state: streaming -> done).
   * Called when streaming for the message is complete.
   */
  finalizeMessage(messageId: string): Promise<void>;

  /**
   * Accumulate token usage for a message.
   * Called on each step-finish to add tokens to running totals.
   * Includes cache and reasoning tokens for accurate cost computation.
   */
  accumulateUsage(
    messageId: string,
    usage: StoredUsage,
    modelId?: string
  ): Promise<void>;

  /**
   * Get aggregated usage across all messages in a conversation.
   * Used for on-demand cost computation.
   */
  getConversationUsage(conversationId: string): Promise<ConversationUsage>;

  /**
   * Get the last assistant message's usage (context size at most recent turn).
   * Returns the inputTokens which represents the full context sent to the model.
   */
  getLastMessageUsage(conversationId: string): Promise<{ inputTokens: number; outputTokens: number } | null>;

  // === Conversation Management ===

  /** List conversations, optionally filtered by channel name. Ordered by most recently updated. */
  listConversations(channelName?: string): Promise<ConversationInfo[]>;

  /** Delete a conversation and all its messages. */
  deleteConversation(conversationId: string): Promise<void>;

  /** Gracefully close the store (flush writes, release connections, etc.) */
  close(): Promise<void>;

  // === Subagent Thread Management ===

  /**
   * Create a child conversation for a subagent execution.
   * Links the new conversation to the parent via tool call ID.
   * @returns The generated conversation ID
   */
  createSubagentConversation(
    parentId: string,
    toolCallId: string,
    subagentName: string,
    meta?: MessageMeta
  ): Promise<string>;

  /**
   * Link a tool call to its spawned thread.
   * Updates the tool part with a threadId field.
   */
  linkToolToThread(
    messageId: string,
    toolCallId: string,
    threadId: string
  ): Promise<void>;

  /**
   * Get child threads (subagent conversations) for a parent conversation.
   */
  getChildThreads(conversationId: string): Promise<ConversationInfo[]>;
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
  logger.debug("Registry", "Store registered", { type: factory.type });
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

  logger.debug("Registry", "Creating store", { type: config.type });
  return factory.create(config);
}
