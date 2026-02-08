/**
 * SqliteStore - Persistent conversation history storage using SQLite
 *
 * Uses Bun's native bun:sqlite for zero-dependency persistence.
 * Conversations survive restarts. WAL mode for better concurrency.
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  defineStore,
  logger,
  type IMessageStore,
  type ConversationInfo,
  type MessageMeta,
  type ChatMessage,
  type StorageConfig,
} from "@pandora/core";

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
        channel_name TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Index for fast history retrieval
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, created_at)
    `);

    // Migration: add channel_name column if missing (for existing databases)
    this.migrateAddChannelName();
  }

  /** Add channel_name column to messages table if it doesn't exist. */
  private migrateAddChannelName(): void {
    const columns = this.db
      .query<{ name: string }, []>("PRAGMA table_info(messages)")
      .all();
    const hasChannelName = columns.some((col) => col.name === "channel_name");
    if (!hasChannelName) {
      this.db.run("ALTER TABLE messages ADD COLUMN channel_name TEXT");
      logger.startup("SQLite migration: added channel_name to messages");
    }
  }

  /** @inheritdoc */
  async addMessage(
    conversationId: string,
    message: ChatMessage,
    meta?: MessageMeta
  ): Promise<void> {
    // Ensure the conversation exists (upsert with metadata)
    this.db.run(
      `INSERT INTO conversations (id, channel_name, user_id) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = unixepoch()`,
      [conversationId, meta?.channelName ?? null, meta?.userId ?? null]
    );

    // Store message with source channel (may differ from conversation origin)
    this.db.run(
      `INSERT INTO messages (conversation_id, role, content, channel_name) VALUES (?, ?, ?, ?)`,
      [conversationId, message.role, message.content, meta?.channelName ?? null]
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
  async listConversations(channelName?: string): Promise<ConversationInfo[]> {
    const sql = `
      SELECT c.id, c.channel_name, c.created_at, c.updated_at,
        (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user'
         ORDER BY created_at ASC, id ASC LIMIT 1) as preview,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      ${channelName ? "WHERE c.channel_name = ?" : ""}
      ORDER BY c.updated_at DESC`;

    type Row = {
      id: string;
      channel_name: string | null;
      created_at: number;
      updated_at: number;
      preview: string | null;
      message_count: number;
    };

    const rows = channelName
      ? this.db.query<Row, [string]>(sql).all(channelName)
      : this.db.query<Row, []>(sql).all();

    return rows.map((row) => ({
      id: row.id,
      channelName: row.channel_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      preview: row.preview?.slice(0, 100) ?? "",
      messageCount: row.message_count,
    }));
  }

  /** @inheritdoc */
  async deleteConversation(conversationId: string): Promise<void> {
    // Messages cascade-delete due to FK constraint
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
