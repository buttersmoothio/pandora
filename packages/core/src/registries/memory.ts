/**
 * Memory Registry - Framework infrastructure for registering memory providers
 *
 * Memory providers implement episodic and/or semantic memory for the agent.
 * Each provider is defined in src/memory/ and self-registers using defineMemory().
 */

import type { MemoryConfig } from "../config";

// ============================================================================
// Constants
// ============================================================================

/** Memory tool names for subagent opt-out filtering and tool creation */
export const MEMORY_TOOL_NAMES = ["remember", "recall", "getMemory", "forget"] as const;

// ============================================================================
// Types
// ============================================================================

/** An episodic memory record (interaction event, past conversation summary). */
export interface Episode {
  id: string;
  /** Summary of the interaction (user message + truncated assistant response) */
  content: string;
  /** Source conversation ID */
  conversationId?: string;
  /** Channel where this occurred */
  channelName?: string;
  /** User involved */
  userId?: string;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Importance score (0-1) */
  importance: number;
  /** Optional tags for filtering */
  tags: string[];
}

/** A semantic memory record (fact, preference, knowledge). */
export interface Fact {
  id: string;
  /** The fact/preference/knowledge content */
  content: string;
  /** Category: user_preference, knowledge, instruction */
  category: string;
  /** Unix timestamp (seconds) */
  createdAt: number;
  /** Unix timestamp (seconds) */
  updatedAt: number;
  /** Source of this fact (e.g., conversation ID) */
  source?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/** A memory chunk from search results */
export interface MemoryChunk {
  /** Chunk ID */
  chunkId: string;
  /** Chunk text content */
  content: string;
  /** Parent record ID */
  parentId: string;
  /** Parent record type */
  parentType: "episode" | "fact";
  /** Hybrid search score (0-1) */
  score: number;
  /** Chunk index within parent (0-based) */
  chunkIndex: number;
  // Parent metadata (varies by type)
  /** Unix timestamp - episodes only */
  timestamp?: number;
  /** Conversation ID - episodes only */
  conversationId?: string;
  /** Category - facts only */
  category?: string;
}

/** Search result with score (legacy, for backward compatibility) */
export interface MemorySearchResult<T> {
  item: T;
  /** Cosine similarity score (0-1) */
  score: number;
}

/** Combined chunk search results from both memory types */
export interface MemorySearchResults {
  /** Matching chunks from episodic memory */
  episodes: MemoryChunk[];
  /** Matching chunks from semantic memory */
  facts: MemoryChunk[];
}

// ============================================================================
// Interfaces
// ============================================================================

/** Episodic memory capability - automatic interaction logging */
export interface IEpisodicMemory {
  /** Add an episode (gateway calls this automatically after each turn) */
  addEpisode(episode: Omit<Episode, "id">): Promise<string>;

  /** Search episodes by semantic similarity (returns matching chunks) */
  searchEpisodes(
    query: string,
    opts?: { limit?: number; minScore?: number; since?: number }
  ): Promise<MemoryChunk[]>;

  /** Get a specific episode by ID */
  getEpisode(id: string): Promise<Episode | null>;

  /** Delete a specific episode */
  deleteEpisode(id: string): Promise<void>;

  /** Delete all episodes for a conversation (called when conversation is deleted) */
  deleteEpisodesForConversation(conversationId: string): Promise<number>;
}

/** Semantic memory capability - agent-controlled facts/preferences/knowledge */
export interface ISemanticMemory {
  /** Create or update a fact (deduplicates by similarity) */
  upsertFact(fact: Omit<Fact, "id" | "createdAt" | "updatedAt">): Promise<string>;

  /** Search facts by semantic similarity (returns matching chunks) */
  searchFacts(
    query: string,
    opts?: { limit?: number; minScore?: number; category?: string }
  ): Promise<MemoryChunk[]>;

  /** Delete a specific fact */
  deleteFact(id: string): Promise<void>;

  /** Get a fact by ID */
  getFact(id: string): Promise<Fact | null>;
}

/** Memory provider with optional episodic and semantic capabilities */
export interface IMemoryProvider {
  /** Episodic memory capability (null if not supported) */
  readonly episodic: IEpisodicMemory | null;
  /** Semantic memory capability (null if not supported) */
  readonly semantic: ISemanticMemory | null;

  /** Search both memory types and return combined results */
  search(
    query: string,
    opts?: { limit?: number; minScore?: number; excludeConversationId?: string }
  ): Promise<MemorySearchResults>;

  /** Close the provider (release resources) */
  close(): Promise<void>;
}

// ============================================================================
// Registry
// ============================================================================

/** Factory function for creating a memory provider */
export type MemoryFactory = (config: MemoryConfig) => Promise<IMemoryProvider>;

/** Memory provider factory registration */
export interface MemoryFactoryRegistration {
  /** Provider type identifier (matches config.memory.type) */
  type: string;
  /** Async factory to create the provider */
  create: MemoryFactory;
}

/** Registry of all memory factories */
const registry = new Map<string, MemoryFactoryRegistration>();

/** Cached singleton instance */
let cachedProvider: IMemoryProvider | null = null;

/**
 * Register a memory provider factory.
 * Call this from each memory provider file to self-register.
 *
 * @param factory - The memory factory registration
 * @returns The same registration (for export convenience)
 */
export function defineMemory(factory: MemoryFactoryRegistration): MemoryFactoryRegistration {
  registry.set(factory.type, factory);
  return factory;
}

/**
 * Get all registered memory provider types.
 */
export function getAvailableMemoryTypes(): string[] {
  return Array.from(registry.keys());
}

/**
 * Create and cache a memory provider from config.
 * Returns null if config is undefined or missing.
 *
 * @param config - Memory config (type, path, embeddingModel, apiKey)
 * @returns Cached provider instance, or null if not configured
 * @throws {Error} If config.type is not registered
 */
export async function createMemory(config?: MemoryConfig): Promise<IMemoryProvider | null> {
  // Return null if not configured
  if (!config) {
    return null;
  }

  // Return cached instance if available
  if (cachedProvider) {
    return cachedProvider;
  }

  const factory = registry.get(config.type);

  if (!factory) {
    const available = getAvailableMemoryTypes().join(", ");
    throw new Error(
      `Unknown memory type: "${config.type}". Available types: ${available || "none registered"}`
    );
  }

  cachedProvider = await factory.create(config);
  return cachedProvider;
}

/**
 * Get the cached memory provider singleton.
 * Returns null if createMemory() hasn't been called or memory isn't configured.
 */
export function getMemoryProvider(): IMemoryProvider | null {
  return cachedProvider;
}

/**
 * Clear the cached memory provider (for testing).
 * @internal
 */
export function _clearMemoryCache(): void {
  cachedProvider = null;
}
