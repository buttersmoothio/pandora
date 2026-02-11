/**
 * SqliteMemoryProvider - Persistent vector memory using SQLite with chunking
 *
 * Uses Bun's native bun:sqlite for zero-dependency persistence.
 * Content is chunked (~400 tokens, 80 token overlap) for better embedding quality.
 * Embeddings via AI SDK embedMany() for batch efficiency.
 *
 * Search modes:
 * - "vector": Cosine similarity only
 * - "keyword": BM25 full-text search only (via FTS5)
 * - "hybrid": Weighted combination of vector + BM25 (default)
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { embedMany } from "ai";
import * as sqliteVec from "sqlite-vec";
import { createEmbeddingModel } from "@pandora/core";
import {
  defineMemory,
  logger,
  generateId,
  type IMemoryProvider,
  type IEpisodicMemory,
  type ISemanticMemory,
  type Episode,
  type Fact,
  type MemoryChunk,
  type MemorySearchResults,
  type MemoryConfig,
} from "@pandora/core";
import { chunkText, countTokens } from "./chunker";

/** Hybrid search weights (vector similarity + BM25 keyword) */
const HYBRID_WEIGHTS = { vector: 0.7, text: 0.3 };

/** Embedding dimension for text-embedding-3-small */
const EMBEDDING_DIMENSION = 1536;

/** Row type for memory_episodes table */
interface EpisodeRow {
  id: string;
  content: string;
  conversation_id: string | null;
  channel_name: string | null;
  user_id: string | null;
  timestamp: number;
  importance: number;
  tags: string | null;
}

/** Row type for memory_facts table */
interface FactRow {
  id: string;
  content: string;
  category: string;
  created_at: number;
  updated_at: number;
  source: string | null;
  confidence: number;
}

/** Row type for memory_chunks table */
interface ChunkRow {
  id: string;
  parent_id: string;
  parent_type: string;
  content: string;
  vector: string;
  start_offset: number;
  end_offset: number;
  chunk_index: number;
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/** Threshold for considering two facts as duplicates (based on first chunk similarity) */
const FACT_DEDUP_THRESHOLD = 0.92;

/**
 * Escape a query string for FTS5 MATCH.
 * FTS5 has special syntax: AND, OR, NOT, NEAR, *, ^, etc.
 * We extract words, strip punctuation, and join with OR for flexible matching.
 */
function escapeFTS5Query(query: string): string {
  // Remove quotes and newlines
  const cleaned = query.replace(/["\n\r]/g, " ");
  // Extract words, strip leading/trailing punctuation from each
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, "")) // Strip punctuation
    .filter((w) => w.length > 1); // Skip single chars and empty
  if (words.length === 0) return '""';
  // Quote each word and join with OR for flexible matching
  return words.map((w) => `"${w}"`).join(" OR ");
}

/**
 * SQLite-backed memory provider with episodic and semantic memory.
 * Uses chunking for better embedding quality and hybrid search.
 */
export class SqliteMemoryProvider implements IMemoryProvider {
  private db: Database;
  private embeddingModel: string;
  private apiKey: string;

  /** Use SqliteMemoryProvider.create() instead of constructing directly */
  private constructor(db: Database, embeddingModel: string, apiKey: string) {
    this.db = db;
    this.embeddingModel = embeddingModel;
    this.apiKey = apiKey;
  }

  /**
   * Create and initialize a SQLite memory provider.
   *
   * @param config - Memory config (path, embeddingModel, apiKey)
   */
  static async create(config: MemoryConfig): Promise<SqliteMemoryProvider> {
    const dbPath = config.path!;

    // Ensure parent directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const db = new Database(dbPath);

    // Initialize schema
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");

    // Episodes table (automatic interaction logging) - no vector column
    db.run(`
      CREATE TABLE IF NOT EXISTS memory_episodes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        conversation_id TEXT,
        channel_name TEXT,
        user_id TEXT,
        timestamp INTEGER NOT NULL,
        importance REAL DEFAULT 0.5,
        tags TEXT
      )
    `);

    // Facts table (agent-controlled semantic memory) - no vector column
    db.run(`
      CREATE TABLE IF NOT EXISTS memory_facts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT,
        confidence REAL DEFAULT 1.0
      )
    `);

    // Chunks table (stores embeddings for both episodes and facts)
    db.run(`
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        parent_type TEXT NOT NULL CHECK(parent_type IN ('episode', 'fact')),
        content TEXT NOT NULL,
        vector TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL
      )
    `);

    // FTS5 virtual table for BM25 keyword search on chunks
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
        content,
        content='memory_chunks',
        content_rowid='rowid'
      )
    `);

    // Triggers to keep FTS table in sync with chunks
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END
    `);
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_chunks_au AFTER UPDATE ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO memory_chunks_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);

    // Indices for common queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON memory_episodes (timestamp DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_facts_category ON memory_facts (category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_parent ON memory_chunks (parent_id, parent_type)`);

    // Load sqlite-vec extension for indexed vector search
    sqliteVec.load(db);

    // Create vec0 virtual table for indexed vector search
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding float[${EMBEDDING_DIMENSION}]
      )
    `);

    logger.startup("SQLite memory provider initialized", { path: dbPath });

    return new SqliteMemoryProvider(
      db,
      config.embeddingModel ?? "openai/text-embedding-3-small",
      config.apiKey ?? ""
    );
  }

  /** Batch embed multiple texts using AI SDK embedMany */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const model = createEmbeddingModel(this.embeddingModel, this.apiKey);
      const { embeddings } = await embedMany({ model, values: texts });
      return embeddings;
    } catch (error) {
      logger.error("Memory", `Embedding failed for ${texts.length} text(s)`, error);
      throw error;
    }
  }

  /**
   * Store chunks for a parent record.
   * Chunks the content, batch embeds, and inserts into chunks table + vec_chunks.
   */
  private async storeChunks(
    parentId: string,
    parentType: "episode" | "fact",
    content: string
  ): Promise<void> {
    const chunks = chunkText(content);
    const texts = chunks.map((c) => c.content);
    const vectors = await this.embedBatch(texts);

    const insertChunk = this.db.prepare(`
      INSERT INTO memory_chunks (id, parent_id, parent_type, content, vector, start_offset, end_offset, chunk_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVec = this.db.prepare(`INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const vector = vectors[i]!;
      const chunkId = generateId();

      insertChunk.run(
        chunkId,
        parentId,
        parentType,
        chunk.content,
        JSON.stringify(vector),
        chunk.startOffset,
        chunk.endOffset,
        chunk.index
      );

      // Also insert into vec_chunks for indexed vector search
      insertVec.run(chunkId, new Float32Array(vector));
    }

    logger.info("Memory", `Stored ${chunks.length} chunk(s) for ${parentType}: ${parentId}`);
  }

  /** Delete all chunks for a parent record */
  private deleteChunksForParent(parentId: string, parentType: "episode" | "fact"): void {
    // First get chunk IDs to delete from vec_chunks
    const chunkIds = this.db
      .query<{ id: string }, [string, string]>(
        `SELECT id FROM memory_chunks WHERE parent_id = ? AND parent_type = ?`
      )
      .all(parentId, parentType);

    // Delete from vec_chunks
    for (const { id } of chunkIds) {
      this.db.run(`DELETE FROM vec_chunks WHERE chunk_id = ?`, [id]);
    }

    // Delete from memory_chunks (FTS5 triggers handle memory_chunks_fts)
    this.db.run(
      `DELETE FROM memory_chunks WHERE parent_id = ? AND parent_type = ?`,
      [parentId, parentType]
    );

    logger.debug("Memory", `Deleted ${chunkIds.length} chunk(s)`, { parentId, parentType });
  }

  /**
   * Search chunks using BM25 full-text search.
   * Returns map of chunk_id -> normalized BM25 score (0-1).
   *
   * @param query - Search query text
   * @param parentType - Filter by parent type ('episode' or 'fact')
   * @param limit - Maximum results
   * @param additionalFilter - Optional parameterized filter { sql: string, param: value }
   */
  private searchChunksBM25(
    query: string,
    parentType: "episode" | "fact",
    limit: number,
    additionalFilter?: { sql: string; param: string | number }
  ): Map<string, number> {
    const results = new Map<string, number>();
    const ftsQuery = escapeFTS5Query(query);

    // FTS5 MATCH query with BM25 scoring, filtered by parent_type
    let sql = `
      SELECT c.id, -bm25(memory_chunks_fts) as score
      FROM memory_chunks_fts fts
      JOIN memory_chunks c ON c.rowid = fts.rowid
    `;

    // Join to parent table if we need to filter by parent columns
    if (parentType === "episode" && additionalFilter) {
      sql += ` JOIN memory_episodes e ON e.id = c.parent_id`;
    } else if (parentType === "fact" && additionalFilter) {
      sql += ` JOIN memory_facts f ON f.id = c.parent_id`;
    }

    sql += ` WHERE memory_chunks_fts MATCH ? AND c.parent_type = ?`;

    const params: (string | number)[] = [ftsQuery, parentType];

    if (additionalFilter) {
      sql += ` AND ${additionalFilter.sql}`;
      params.push(additionalFilter.param);
    }
    sql += ` ORDER BY score DESC LIMIT ?`;
    params.push(limit * 2);

    let rows: { id: string; score: number }[];
    try {
      rows = this.db
        .query<{ id: string; score: number }, (string | number)[]>(sql)
        .all(...params);
    } catch {
      // FTS5 query failed (malformed query) - return empty results
      logger.warn("Memory", "BM25 search failed", { query });
      return results;
    }

    if (rows.length === 0) return results;

    // Normalize BM25 scores to 0-1 range
    // BM25 returns negative scores (SQLite FTS5), higher absolute = more relevant
    const scores = rows.map((r) => Math.abs(r.score));
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore;

    for (let i = 0; i < rows.length; i++) {
      const normalized = range > 0.001 ? (scores[i]! - minScore) / range : 1.0;
      results.set(rows[i]!.id, normalized);
    }

    return results;
  }

  /**
   * Search chunks using indexed vector search (sqlite-vec).
   * Returns map of chunk_id -> similarity score (0-1).
   *
   * Uses CTE pattern per sqlite-vec docs: KNN query must be isolated,
   * then JOINed afterward. Direct JOINs break the LIMIT/k constraint.
   */
  private searchChunksVector(
    queryVector: number[],
    parentType: "episode" | "fact",
    limit: number
  ): Map<string, number> {
    const query = new Float32Array(queryVector);

    // sqlite-vec uses L2 distance (lower = more similar)
    // CTE isolates the KNN query so LIMIT is recognized
    const rows = this.db
      .query<{ chunk_id: string; distance: number }, [Float32Array, number, string]>(
        `
        WITH knn AS (
          SELECT chunk_id, distance
          FROM vec_chunks
          WHERE embedding MATCH ?
          LIMIT ?
        )
        SELECT knn.chunk_id, knn.distance
        FROM knn
        JOIN memory_chunks mc ON mc.id = knn.chunk_id
        WHERE mc.parent_type = ?
        `
      )
      .all(query, limit * 2, parentType);

    const results = new Map<string, number>();
    for (const row of rows) {
      // Convert L2 distance to similarity (0-1). For normalized vectors: sim ≈ 1 - d²/2
      const similarity = Math.max(0, 1 - (row.distance * row.distance) / 2);
      results.set(row.chunk_id, similarity);
    }
    return results;
  }

  /**
   * Merge vector and BM25 scores using weighted combination.
   * finalScore = vectorWeight * vectorScore + textWeight * textScore
   */
  private mergeScores(
    vectorScores: Map<string, number>,
    bm25Scores: Map<string, number>
  ): Map<string, number> {
    const merged = new Map<string, number>();
    const { vector: vw, text: tw } = HYBRID_WEIGHTS;

    // Get all unique IDs
    const allIds = new Set([...vectorScores.keys(), ...bm25Scores.keys()]);

    for (const id of allIds) {
      const vectorScore = vectorScores.get(id) ?? 0;
      const textScore = bm25Scores.get(id) ?? 0;
      const finalScore = vw * vectorScore + tw * textScore;
      merged.set(id, finalScore);
    }

    return merged;
  }

  // ============================================================================
  // IEpisodicMemory implementation
  // ============================================================================

  readonly episodic: IEpisodicMemory = {
    addEpisode: async (episode): Promise<string> => {
      const id = generateId();

      // Insert episode record (without vector)
      this.db.run(
        `INSERT INTO memory_episodes (id, content, conversation_id, channel_name, user_id, timestamp, importance, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          episode.content,
          episode.conversationId ?? null,
          episode.channelName ?? null,
          episode.userId ?? null,
          episode.timestamp,
          episode.importance,
          episode.tags.length > 0 ? JSON.stringify(episode.tags) : null,
        ]
      );

      // Store chunks with embeddings
      await this.storeChunks(id, "episode", episode.content);

      logger.info("Memory", `Stored episode: ${id} (${countTokens(episode.content)} tokens)`);
      return id;
    },

    searchEpisodes: async (query, opts = {}): Promise<MemoryChunk[]> => {
      const { limit = 10, minScore = 0.5, since } = opts;

      // Embed query
      const [queryVector] = await this.embedBatch([query]);

      // Use indexed vector search (O(log n) instead of O(n))
      const vectorScores = this.searchChunksVector(queryVector!, "episode", limit);

      // BM25 keyword scores
      const bm25Scores = this.searchChunksBM25(
        query,
        "episode",
        limit,
        since ? { sql: `e.timestamp >= ?`, param: since } : undefined
      );

      // Merge with weights
      const finalScores = this.mergeScores(vectorScores, bm25Scores);

      // Get chunk IDs that pass the score threshold
      const matchingIds = [...finalScores.entries()]
        .filter(([, score]) => score >= minScore)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

      if (matchingIds.length === 0) return [];

      // Fetch chunk details for matching IDs
      const placeholders = matchingIds.map(() => "?").join(",");
      const rows = this.db
        .query<ChunkRow & { timestamp: number; conversation_id: string | null }, string[]>(
          `
          SELECT c.*, e.timestamp, e.conversation_id
          FROM memory_chunks c
          JOIN memory_episodes e ON e.id = c.parent_id
          WHERE c.id IN (${placeholders})
            ${since ? `AND e.timestamp >= ${since}` : ""}
          `
        )
        .all(...matchingIds);

      // Build results with scores
      const results: MemoryChunk[] = [];
      for (const row of rows) {
        const score = finalScores.get(row.id);
        if (score === undefined) continue;

        results.push({
          chunkId: row.id,
          content: row.content,
          parentId: row.parent_id,
          parentType: "episode",
          score,
          chunkIndex: row.chunk_index,
          timestamp: row.timestamp,
          conversationId: row.conversation_id ?? undefined,
        });
      }

      // Sort by score descending
      return results.sort((a, b) => b.score - a.score);
    },

    getEpisode: async (id): Promise<Episode | null> => {
      const row = this.db
        .query<EpisodeRow, [string]>(`SELECT * FROM memory_episodes WHERE id = ?`)
        .get(id);

      if (!row) return null;

      return {
        id: row.id,
        content: row.content,
        conversationId: row.conversation_id ?? undefined,
        channelName: row.channel_name ?? undefined,
        userId: row.user_id ?? undefined,
        timestamp: row.timestamp,
        importance: row.importance,
        tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
      };
    },

    deleteEpisode: async (id): Promise<void> => {
      this.deleteChunksForParent(id, "episode");
      this.db.run(`DELETE FROM memory_episodes WHERE id = ?`, [id]);
    },

    deleteEpisodesForConversation: async (conversationId): Promise<number> => {
      // Get episode IDs first
      const episodes = this.db
        .query<{ id: string }, [string]>(`SELECT id FROM memory_episodes WHERE conversation_id = ?`)
        .all(conversationId);

      // Delete chunks for each episode
      for (const ep of episodes) {
        this.deleteChunksForParent(ep.id, "episode");
      }

      // Delete episodes
      const result = this.db.run(
        `DELETE FROM memory_episodes WHERE conversation_id = ?`,
        [conversationId]
      );
      const count = result.changes;
      if (count > 0) {
        logger.info("Memory", `Deleted ${count} episodes for conversation: ${conversationId}`);
      }
      return count;
    },
  };

  // ============================================================================
  // ISemanticMemory implementation
  // ============================================================================

  readonly semantic: ISemanticMemory = {
    upsertFact: async (fact): Promise<string> => {
      const now = Math.floor(Date.now() / 1000);

      // Chunk the new fact content
      const chunks = chunkText(fact.content);
      const texts = chunks.map((c) => c.content);
      const vectors = await this.embedBatch(texts);

      // Check for existing similar facts (compare first chunk)
      const existingFirstChunks = this.db
        .query<{ parent_id: string; vector: string }, []>(
          `SELECT parent_id, vector FROM memory_chunks WHERE parent_type = 'fact' AND chunk_index = 0`
        )
        .all();

      for (const existing of existingFirstChunks) {
        const existingVector = JSON.parse(existing.vector) as number[];
        const similarity = cosineSimilarity(vectors[0]!, existingVector);

        if (similarity >= FACT_DEDUP_THRESHOLD) {
          // Update existing fact instead of creating duplicate
          const existingId = existing.parent_id;

          this.db.run(
            `UPDATE memory_facts SET content = ?, category = ?, updated_at = ?, source = ?, confidence = ?
             WHERE id = ?`,
            [
              fact.content,
              fact.category,
              now,
              fact.source ?? null,
              fact.confidence,
              existingId,
            ]
          );

          // Replace chunks
          this.deleteChunksForParent(existingId, "fact");
          await this.storeChunksWithVectors(existingId, "fact", chunks, vectors);

          logger.info("Memory", `Updated existing fact: ${existingId}`);
          return existingId;
        }
      }

      // No similar fact found, create new one
      const id = generateId();
      this.db.run(
        `INSERT INTO memory_facts (id, content, category, created_at, updated_at, source, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          fact.content,
          fact.category,
          now,
          now,
          fact.source ?? null,
          fact.confidence,
        ]
      );

      // Store chunks (reuse already computed vectors)
      await this.storeChunksWithVectors(id, "fact", chunks, vectors);

      logger.info("Memory", `Stored fact: ${id} (${countTokens(fact.content)} tokens)`);
      return id;
    },

    searchFacts: async (query, opts = {}): Promise<MemoryChunk[]> => {
      const { limit = 10, minScore = 0.5, category } = opts;

      // Embed query
      const [queryVector] = await this.embedBatch([query]);

      // Use indexed vector search (O(log n) instead of O(n))
      const vectorScores = this.searchChunksVector(queryVector!, "fact", limit);

      // BM25 keyword scores
      const bm25Scores = this.searchChunksBM25(
        query,
        "fact",
        limit,
        category ? { sql: `f.category = ?`, param: category } : undefined
      );

      // Merge with weights
      const finalScores = this.mergeScores(vectorScores, bm25Scores);

      // Get chunk IDs that pass the score threshold
      const matchingIds = [...finalScores.entries()]
        .filter(([, score]) => score >= minScore)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

      if (matchingIds.length === 0) return [];

      // Fetch chunk details for matching IDs
      const placeholders = matchingIds.map(() => "?").join(",");
      const rows = this.db
        .query<ChunkRow & { category: string }, string[]>(
          `
          SELECT c.*, f.category
          FROM memory_chunks c
          JOIN memory_facts f ON f.id = c.parent_id
          WHERE c.id IN (${placeholders})
            ${category ? `AND f.category = '${category}'` : ""}
          `
        )
        .all(...matchingIds);

      // Build results with scores
      const results: MemoryChunk[] = [];
      for (const row of rows) {
        const score = finalScores.get(row.id);
        if (score === undefined) continue;

        results.push({
          chunkId: row.id,
          content: row.content,
          parentId: row.parent_id,
          parentType: "fact",
          score,
          chunkIndex: row.chunk_index,
          category: row.category,
        });
      }

      // Sort by score descending
      return results.sort((a, b) => b.score - a.score);
    },

    deleteFact: async (id): Promise<void> => {
      this.deleteChunksForParent(id, "fact");
      this.db.run(`DELETE FROM memory_facts WHERE id = ?`, [id]);
    },

    getFact: async (id): Promise<Fact | null> => {
      const row = this.db
        .query<FactRow, [string]>(`SELECT * FROM memory_facts WHERE id = ?`)
        .get(id);

      if (!row) return null;

      return {
        id: row.id,
        content: row.content,
        category: row.category,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: row.source ?? undefined,
        confidence: row.confidence,
      };
    },
  };

  /**
   * Store chunks with pre-computed vectors (for upsertFact optimization).
   */
  private async storeChunksWithVectors(
    parentId: string,
    parentType: "episode" | "fact",
    chunks: ReturnType<typeof chunkText>,
    vectors: number[][]
  ): Promise<void> {
    const insertChunk = this.db.prepare(`
      INSERT INTO memory_chunks (id, parent_id, parent_type, content, vector, start_offset, end_offset, chunk_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVec = this.db.prepare(`INSERT INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const vector = vectors[i]!;
      const chunkId = generateId();

      insertChunk.run(
        chunkId,
        parentId,
        parentType,
        chunk.content,
        JSON.stringify(vector),
        chunk.startOffset,
        chunk.endOffset,
        chunk.index
      );

      // Also insert into vec_chunks for indexed vector search
      insertVec.run(chunkId, new Float32Array(vector));
    }
  }

  // ============================================================================
  // IMemoryProvider implementation
  // ============================================================================

  async search(query: string, opts: { limit?: number; minScore?: number; excludeConversationId?: string } = {}): Promise<MemorySearchResults> {
    const { limit = 10, minScore = 0.5, excludeConversationId } = opts;

    // Search both memory types in parallel
    const [episodes, facts] = await Promise.all([
      this.episodic.searchEpisodes(query, { limit, minScore }),
      this.semantic.searchFacts(query, { limit, minScore }),
    ]);

    // Filter out episodes from the current conversation to avoid redundancy
    const filteredEpisodes = excludeConversationId
      ? episodes.filter((e) => e.conversationId !== excludeConversationId)
      : episodes;

    return { episodes: filteredEpisodes, facts };
  }

  async close(): Promise<void> {
    this.db.close();
    logger.info("Memory", "SQLite memory provider closed");
  }
}

// Self-register the memory provider
export default defineMemory({
  type: "sqlite",
  create: (config: MemoryConfig) => SqliteMemoryProvider.create(config),
});
