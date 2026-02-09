/**
 * SqliteMemoryProvider - Persistent vector memory using SQLite
 *
 * Uses Bun's native bun:sqlite for zero-dependency persistence.
 * Embeddings via AI SDK embed() with configurable model.
 *
 * Supports three search modes:
 * - "vector": Cosine similarity only (original behavior)
 * - "keyword": BM25 full-text search only (via FTS5)
 * - "hybrid": Weighted combination of vector + BM25 (default)
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { embed } from "ai";
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
  type MemorySearchResult,
  type MemorySearchResults,
  type MemoryConfig,
} from "@pandora/core";

/** Hybrid search weights (vector similarity + BM25 keyword) */
const HYBRID_WEIGHTS = { vector: 0.7, text: 0.3 };

/** Row type for memory_episodes table */
interface EpisodeRow {
  id: string;
  content: string;
  vector: string;
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
  vector: string;
  category: string;
  created_at: number;
  updated_at: number;
  source: string | null;
  confidence: number;
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

/** Threshold for considering two facts as duplicates */
const FACT_DEDUP_THRESHOLD = 0.92;

/**
 * Escape a query string for FTS5 MATCH.
 * FTS5 has special syntax: AND, OR, NOT, NEAR, *, ^, etc.
 * We wrap each token in quotes to treat it as a literal phrase.
 */
function escapeFTS5Query(query: string): string {
  // Remove characters that break FTS5 even inside quotes
  const cleaned = query.replace(/["\n\r]/g, " ");
  // Wrap in quotes for phrase matching
  return `"${cleaned}"`;
}

/**
 * SQLite-backed memory provider with episodic and semantic memory.
 * Uses hybrid search: vector similarity + BM25 keyword matching.
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
    const dbPath = config.path ?? "data/memory.db";

    // Ensure parent directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const db = new Database(dbPath);

    // Initialize schema
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");

    // Episodes table (automatic interaction logging)
    db.run(`
      CREATE TABLE IF NOT EXISTS memory_episodes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        vector TEXT NOT NULL,
        conversation_id TEXT,
        channel_name TEXT,
        user_id TEXT,
        timestamp INTEGER NOT NULL,
        importance REAL DEFAULT 0.5,
        tags TEXT
      )
    `);

    // Facts table (agent-controlled semantic memory)
    db.run(`
      CREATE TABLE IF NOT EXISTS memory_facts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        vector TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT,
        confidence REAL DEFAULT 1.0
      )
    `);

    // FTS5 virtual tables for BM25 keyword search
    // Using content="" for external content tables (data lives in main tables)
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_episodes_fts USING fts5(
        content,
        content='memory_episodes',
        content_rowid='rowid'
      )
    `);

    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_fts USING fts5(
        content,
        content='memory_facts',
        content_rowid='rowid'
      )
    `);

    // Triggers to keep FTS tables in sync with main tables
    // Episodes: INSERT
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_episodes_ai AFTER INSERT ON memory_episodes BEGIN
        INSERT INTO memory_episodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);
    // Episodes: DELETE
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_episodes_ad AFTER DELETE ON memory_episodes BEGIN
        INSERT INTO memory_episodes_fts(memory_episodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END
    `);
    // Episodes: UPDATE
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_episodes_au AFTER UPDATE ON memory_episodes BEGIN
        INSERT INTO memory_episodes_fts(memory_episodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO memory_episodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);

    // Facts: INSERT
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_facts_ai AFTER INSERT ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);
    // Facts: DELETE
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_facts_ad AFTER DELETE ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(memory_facts_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END
    `);
    // Facts: UPDATE
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memory_facts_au AFTER UPDATE ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(memory_facts_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO memory_facts_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);

    // Indices for common queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON memory_episodes (timestamp DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_facts_category ON memory_facts (category)`);

    logger.startup("SQLite memory provider initialized", { path: dbPath });

    return new SqliteMemoryProvider(
      db,
      config.embeddingModel ?? "openai/text-embedding-3-small",
      config.apiKey ?? ""
    );
  }

  /** Generate embedding for text using AI SDK */
  private async embed(text: string): Promise<number[]> {
    const model = createEmbeddingModel(this.embeddingModel, this.apiKey);
    const { embedding } = await embed({ model, value: text });
    return embedding;
  }

  /**
   * Search episodes using BM25 full-text search.
   * Returns map of id -> normalized BM25 score (0-1).
   */
  private searchEpisodesBM25(query: string, limit: number): Map<string, number> {
    const results = new Map<string, number>();
    const ftsQuery = escapeFTS5Query(query);

    // FTS5 MATCH query with BM25 scoring
    // bm25() returns negative scores where more negative = better match
    let rows: { id: string; score: number }[];
    try {
      rows = this.db.query<{ id: string; score: number }, [string, number]>(`
        SELECT e.id, -bm25(memory_episodes_fts) as score
        FROM memory_episodes_fts fts
        JOIN memory_episodes e ON e.rowid = fts.rowid
        WHERE memory_episodes_fts MATCH ?
        ORDER BY score DESC
        LIMIT ?
      `).all(ftsQuery, limit * 2); // Fetch extra for merging
    } catch {
      // FTS5 query failed (malformed query) - return empty results
      return results;
    }

    if (rows.length === 0) return results;

    // Normalize scores to 0-1 range (min-max normalization)
    const maxScore = rows[0]?.score ?? 1;
    const minScore = rows[rows.length - 1]?.score ?? 0;
    const range = maxScore - minScore || 1;

    for (const row of rows) {
      const normalized = (row.score - minScore) / range;
      results.set(row.id, normalized);
    }

    return results;
  }

  /**
   * Search facts using BM25 full-text search.
   * Returns map of id -> normalized BM25 score (0-1).
   */
  private searchFactsBM25(query: string, limit: number, category?: string): Map<string, number> {
    const results = new Map<string, number>();
    const ftsQuery = escapeFTS5Query(query);

    // FTS5 MATCH query with optional category filter
    const sql = category
      ? `
        SELECT f.id, -bm25(memory_facts_fts) as score
        FROM memory_facts_fts fts
        JOIN memory_facts f ON f.rowid = fts.rowid
        WHERE memory_facts_fts MATCH ? AND f.category = ?
        ORDER BY score DESC
        LIMIT ?
      `
      : `
        SELECT f.id, -bm25(memory_facts_fts) as score
        FROM memory_facts_fts fts
        JOIN memory_facts f ON f.rowid = fts.rowid
        WHERE memory_facts_fts MATCH ?
        ORDER BY score DESC
        LIMIT ?
      `;

    let rows: { id: string; score: number }[];
    try {
      rows = category
        ? this.db.query<{ id: string; score: number }, [string, string, number]>(sql).all(ftsQuery, category, limit * 2)
        : this.db.query<{ id: string; score: number }, [string, number]>(sql).all(ftsQuery, limit * 2);
    } catch {
      // FTS5 query failed - return empty results
      return results;
    }

    if (rows.length === 0) return results;

    // Normalize scores to 0-1 range
    const maxScore = rows[0]?.score ?? 1;
    const minScore = rows[rows.length - 1]?.score ?? 0;
    const range = maxScore - minScore || 1;

    for (const row of rows) {
      const normalized = (row.score - minScore) / range;
      results.set(row.id, normalized);
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
      const vector = await this.embed(episode.content);

      this.db.run(
        `INSERT INTO memory_episodes (id, content, vector, conversation_id, channel_name, user_id, timestamp, importance, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          episode.content,
          JSON.stringify(vector),
          episode.conversationId ?? null,
          episode.channelName ?? null,
          episode.userId ?? null,
          episode.timestamp,
          episode.importance,
          episode.tags.length > 0 ? JSON.stringify(episode.tags) : null,
        ]
      );

      logger.info("Memory", `Stored episode: ${id}`);
      return id;
    },

    searchEpisodes: async (query, opts = {}): Promise<MemorySearchResult<Episode>[]> => {
      const { limit = 10, minScore = 0.5, since } = opts;

      // Load episodes (optionally filtered by time)
      const sql = since
        ? `SELECT * FROM memory_episodes WHERE timestamp >= ? ORDER BY timestamp DESC`
        : `SELECT * FROM memory_episodes ORDER BY timestamp DESC`;

      const rows = since
        ? this.db.query<EpisodeRow, [number]>(sql).all(since)
        : this.db.query<EpisodeRow, []>(sql).all();

      if (rows.length === 0) return [];

      // Build a map of id -> row for quick lookup
      const rowMap = new Map<string, EpisodeRow>();
      for (const row of rows) {
        rowMap.set(row.id, row);
      }

      // Hybrid search: combine vector similarity + BM25 keyword matching
      const queryVector = await this.embed(query);

      // Vector scores (cosine similarity)
      const vectorScores = new Map<string, number>();
      for (const row of rows) {
        const vector = JSON.parse(row.vector) as number[];
        const score = cosineSimilarity(queryVector, vector);
        vectorScores.set(row.id, score);
      }

      // BM25 scores (may return empty if no keyword matches)
      const bm25Scores = this.searchEpisodesBM25(query, limit);

      // Merge with weights
      const finalScores = this.mergeScores(vectorScores, bm25Scores);

      // Build results from scores
      const results: MemorySearchResult<Episode>[] = [];

      for (const [id, score] of finalScores) {
        if (score < minScore) continue;

        const row = rowMap.get(id);
        if (!row) continue;

        results.push({
          score,
          item: {
            id: row.id,
            content: row.content,
            vector: JSON.parse(row.vector) as number[],
            conversationId: row.conversation_id ?? undefined,
            channelName: row.channel_name ?? undefined,
            userId: row.user_id ?? undefined,
            timestamp: row.timestamp,
            importance: row.importance,
            tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
          },
        });
      }

      // Sort by score descending and limit
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    deleteEpisode: async (id): Promise<void> => {
      this.db.run(`DELETE FROM memory_episodes WHERE id = ?`, [id]);
    },

    deleteEpisodesForConversation: async (conversationId): Promise<number> => {
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
      const vector = await this.embed(fact.content);
      const now = Math.floor(Date.now() / 1000);

      // Check for existing similar facts (deduplication)
      const existingFacts = this.db
        .query<FactRow, []>(`SELECT * FROM memory_facts`)
        .all();

      for (const existing of existingFacts) {
        const existingVector = JSON.parse(existing.vector) as number[];
        const similarity = cosineSimilarity(vector, existingVector);

        if (similarity >= FACT_DEDUP_THRESHOLD) {
          // Update existing fact instead of creating duplicate
          this.db.run(
            `UPDATE memory_facts SET content = ?, vector = ?, category = ?, updated_at = ?, source = ?, confidence = ?
             WHERE id = ?`,
            [
              fact.content,
              JSON.stringify(vector),
              fact.category,
              now,
              fact.source ?? null,
              fact.confidence,
              existing.id,
            ]
          );
          logger.info("Memory", `Updated existing fact: ${existing.id}`);
          return existing.id;
        }
      }

      // No similar fact found, create new one
      const id = generateId();
      this.db.run(
        `INSERT INTO memory_facts (id, content, vector, category, created_at, updated_at, source, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          fact.content,
          JSON.stringify(vector),
          fact.category,
          now,
          now,
          fact.source ?? null,
          fact.confidence,
        ]
      );

      logger.info("Memory", `Stored fact: ${id}`);
      return id;
    },

    searchFacts: async (query, opts = {}): Promise<MemorySearchResult<Fact>[]> => {
      const { limit = 10, minScore = 0.5, category } = opts;

      // Load facts (optionally filtered by category)
      const sql = category
        ? `SELECT * FROM memory_facts WHERE category = ?`
        : `SELECT * FROM memory_facts`;

      const rows = category
        ? this.db.query<FactRow, [string]>(sql).all(category)
        : this.db.query<FactRow, []>(sql).all();

      if (rows.length === 0) return [];

      // Build a map of id -> row for quick lookup
      const rowMap = new Map<string, FactRow>();
      for (const row of rows) {
        rowMap.set(row.id, row);
      }

      // Hybrid search: combine vector similarity + BM25 keyword matching
      const queryVector = await this.embed(query);

      // Vector scores (cosine similarity)
      const vectorScores = new Map<string, number>();
      for (const row of rows) {
        const vector = JSON.parse(row.vector) as number[];
        const score = cosineSimilarity(queryVector, vector);
        vectorScores.set(row.id, score);
      }

      // BM25 scores (may return empty if no keyword matches)
      const bm25Scores = this.searchFactsBM25(query, limit, category);

      // Merge with weights
      const finalScores = this.mergeScores(vectorScores, bm25Scores);

      // Build results from scores
      const results: MemorySearchResult<Fact>[] = [];

      for (const [id, score] of finalScores) {
        if (score < minScore) continue;

        const row = rowMap.get(id);
        if (!row) continue;

        results.push({
          score,
          item: {
            id: row.id,
            content: row.content,
            vector: JSON.parse(row.vector) as number[],
            category: row.category,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            source: row.source ?? undefined,
            confidence: row.confidence,
          },
        });
      }

      // Sort by score descending and limit
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    deleteFact: async (id): Promise<void> => {
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
        vector: JSON.parse(row.vector) as number[],
        category: row.category,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: row.source ?? undefined,
        confidence: row.confidence,
      };
    },
  };

  // ============================================================================
  // IMemoryProvider implementation
  // ============================================================================

  async search(query: string, opts: { limit?: number; minScore?: number } = {}): Promise<MemorySearchResults> {
    const { limit = 10, minScore = 0.5 } = opts;

    // Search both memory types in parallel
    const [episodes, facts] = await Promise.all([
      this.episodic.searchEpisodes(query, { limit, minScore }),
      this.semantic.searchFacts(query, { limit, minScore }),
    ]);

    return { episodes, facts };
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
