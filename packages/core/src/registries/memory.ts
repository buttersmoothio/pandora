/**
 * Memory Registry - Framework infrastructure for registering memory providers
 *
 * Memory providers implement episodic and/or semantic memory for the agent.
 * Each provider is defined in src/memory/ and self-registers using defineMemory().
 */

import type { MemoryConfig } from "../config";

// ============================================================================
// Types
// ============================================================================

/** An episodic memory record (interaction event, past conversation summary). */
export interface Episode {
  id: string;
  /** Summary of the interaction (user message + truncated assistant response) */
  content: string;
  /** Embedding vector */
  vector: number[];
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
  /** Embedding vector */
  vector: number[];
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

/** Search result with score */
export interface MemorySearchResult<T> {
  item: T;
  /** Cosine similarity score (0-1) */
  score: number;
}

/** Combined search results from both memory types */
export interface MemorySearchResults {
  episodes: MemorySearchResult<Episode>[];
  facts: MemorySearchResult<Fact>[];
}

// ============================================================================
// Interfaces
// ============================================================================

/** Episodic memory capability - automatic interaction logging */
export interface IEpisodicMemory {
  /** Add an episode (gateway calls this automatically after each turn) */
  addEpisode(episode: Omit<Episode, "id">): Promise<string>;

  /** Search episodes by semantic similarity */
  searchEpisodes(
    query: string,
    opts?: { limit?: number; minScore?: number; since?: number }
  ): Promise<MemorySearchResult<Episode>[]>;

  /** Delete a specific episode */
  deleteEpisode(id: string): Promise<void>;

  /** Delete all episodes for a conversation (called when conversation is deleted) */
  deleteEpisodesForConversation(conversationId: string): Promise<number>;
}

/** Semantic memory capability - agent-controlled facts/preferences/knowledge */
export interface ISemanticMemory {
  /** Create or update a fact (deduplicates by similarity) */
  upsertFact(fact: Omit<Fact, "id" | "createdAt" | "updatedAt">): Promise<string>;

  /** Search facts by semantic similarity */
  searchFacts(
    query: string,
    opts?: { limit?: number; minScore?: number; category?: string }
  ): Promise<MemorySearchResult<Fact>[]>;

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
    opts?: { limit?: number; minScore?: number }
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
