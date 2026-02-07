/**
 * SqliteStore - Persistent conversation history storage using SQLite
 *
 * Uses Bun's native bun:sqlite for zero-dependency persistence.
 * Conversations survive restarts. WAL mode for better concurrency.
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ChatMessage } from "../core/types";
import type { StorageConfig } from "../core/config";
import { defineStore, type IMessageStore } from "../core/registries/store";
import { logger } from "../core/logger";

/** SQLite-backed message store. Persistent; uses WAL mode. */
export class SqliteStore implements IMessageStore {
  private db: Database;

  /**
   * @param dbPath - Path to the SQLite database file (parent dir created if needed).
   */
  constructor(dbPath: string) {
    // Ensure the parent directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
    logger.startup("SQLite store initialized", { path: dbPath });
  }

  /**
   * Set up the database schema and pragmas
   */
  private initialize(): void {
    // Enable WAL mode for better concurrency
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        channel_name TEXT,
        user_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Index for fast history retrieval
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, created_at)
    `);
  }

  /** @inheritdoc */
  async addMessage(
    conversationId: string,
    message: ChatMessage
  ): Promise<void> {
    // Ensure the conversation exists (upsert)
    this.db.run(
      `INSERT INTO conversations (id) VALUES (?)
       ON CONFLICT(id) DO UPDATE SET updated_at = unixepoch()`,
      [conversationId]
    );

    this.db.run(
      `INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`,
      [conversationId, message.role, message.content]
    );
  }

  /** @inheritdoc */
  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    const rows = this.db
      .query<{ role: string; content: string }, [string]>(
        `SELECT role, content FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(conversationId);

    return rows.map((row) => ({
      role: row.role as ChatMessage["role"],
      content: row.content,
    }));
  }

  /** @inheritdoc */
  async clearHistory(conversationId: string): Promise<void> {
    this.db.run(`DELETE FROM messages WHERE conversation_id = ?`, [
      conversationId,
    ]);
    this.db.run(`DELETE FROM conversations WHERE id = ?`, [conversationId]);
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    this.db.close();
  }
}

// Self-register the store
export default defineStore({
  type: "sqlite",
  create: (config: StorageConfig) => new SqliteStore(config.path),
});
