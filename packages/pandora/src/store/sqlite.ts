/**
 * SqliteStore - Persistent conversation history storage using SQLite
 *
 * Uses Bun's native bun:sqlite for zero-dependency persistence.
 * Conversations survive restarts. WAL mode for better concurrency.
 *
 * Schema uses parts-based storage for UIMessage compatibility:
 * - messages: metadata only (id, role, conversation_id, channel_name, created_at)
 * - message_parts: ordered parts with JSON data
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  defineStore,
  logger,
  generateId,
  type IMessageStore,
  type ConversationInfo,
  type MessageMeta,
  type UIMessage,
  type PandoraMessagePart,
  type StorageConfig,
  type ScheduledTask,
  type CreateScheduledTaskInput,
  type UpdateScheduledTaskInput,
} from "@pandora/core";

/** Row type for messages table */
interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  channel_name: string | null;
  model_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  created_at: number;
}

/** Row type for message_parts table */
interface PartRow {
  id: number;
  message_id: string;
  part_index: number;
  part_type: string;
  part_data: string;
  created_at: number;
}

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

  /** Set up the database schema and pragmas */
  private initialize(): void {
    // Enable WAL mode for better concurrency
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");

    // Conversations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        channel_name TEXT,
        user_id TEXT,
        type TEXT NOT NULL DEFAULT 'root',
        parent_conversation_id TEXT,
        parent_tool_call_id TEXT,
        subagent_name TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (parent_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Index for fast parent lookup
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_conversations_parent
      ON conversations (parent_conversation_id)
    `);

    // Messages table - metadata only, no content column
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        channel_name TEXT,
        model_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Message parts table - ordered parts with JSON data
    this.db.run(`
      CREATE TABLE IF NOT EXISTS message_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        part_index INTEGER NOT NULL,
        part_type TEXT NOT NULL,
        part_data TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `);

    // Indices for fast retrieval
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, created_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_parts_message
      ON message_parts (message_id, part_index)
    `);

    // Scheduled tasks table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        user_id TEXT NOT NULL,

        type TEXT NOT NULL CHECK (type IN ('once', 'recurring')),
        task_type TEXT NOT NULL CHECK (task_type IN ('reminder', 'followup', 'custom')),
        description TEXT NOT NULL,
        context TEXT,

        run_at INTEGER,
        cron_expression TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',

        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'cancelled', 'failed')),
        last_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        max_runs INTEGER,

        last_error TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        max_failures INTEGER NOT NULL DEFAULT 3,

        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Index for fast pending task retrieval
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status
      ON scheduled_tasks (status, run_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_conversation
      ON scheduled_tasks (conversation_id)
    `);
  }

  /** Ensure conversation exists, update timestamp */
  private ensureConversation(
    conversationId: string,
    meta?: MessageMeta
  ): void {
    this.db.run(
      `INSERT INTO conversations (id, channel_name, user_id) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = unixepoch()`,
      [conversationId, meta?.channelName ?? null, meta?.userId ?? null]
    );
  }

  /** @inheritdoc */
  async addMessage(
    conversationId: string,
    message: Omit<UIMessage, "id">,
    meta?: MessageMeta
  ): Promise<string> {
    const messageId = generateId();

    this.ensureConversation(conversationId, meta);

    // Insert message metadata
    this.db.run(
      `INSERT INTO messages (id, conversation_id, role, channel_name) VALUES (?, ?, ?, ?)`,
      [messageId, conversationId, message.role, meta?.channelName ?? null]
    );

    // Insert all parts
    for (let i = 0; i < message.parts.length; i++) {
      const part = message.parts[i];
      if (part) {
        this.db.run(
          `INSERT INTO message_parts (message_id, part_index, part_type, part_data) VALUES (?, ?, ?, ?)`,
          [messageId, i, part.type, JSON.stringify(part)]
        );
      }
    }

    return messageId;
  }

  /** @inheritdoc */
  async getHistory(conversationId: string): Promise<UIMessage[]> {
    // Get all messages for this conversation
    // Use rowid for ordering to preserve insertion order (random IDs don't sort correctly)
    const messages = this.db
      .query<MessageRow, [string]>(
        `SELECT id, conversation_id, role, channel_name, input_tokens, output_tokens, total_tokens, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY rowid ASC`
      )
      .all(conversationId);

    // Build UIMessage objects with parts
    const result: UIMessage[] = [];

    for (const msg of messages) {
      const parts = this.db
        .query<PartRow, [string]>(
          `SELECT id, message_id, part_index, part_type, part_data, created_at
           FROM message_parts
           WHERE message_id = ?
           ORDER BY part_index ASC`
        )
        .all(msg.id);

      // Include usage if present (assistant messages with token counts)
      const usage = msg.total_tokens > 0
        ? { inputTokens: msg.input_tokens, outputTokens: msg.output_tokens, totalTokens: msg.total_tokens }
        : undefined;

      result.push({
        id: msg.id,
        role: msg.role as "user" | "assistant",
        parts: parts.map((p) => JSON.parse(p.part_data) as PandoraMessagePart),
        channelName: msg.channel_name ?? undefined,
        usage,
      } as UIMessage & { channelName?: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } });
    }

    return result;
  }

  /** @inheritdoc */
  async replaceHistory(conversationId: string, messages: UIMessage[]): Promise<void> {
    logger.info("Store", "Replacing conversation history", { conversationId, messageCount: messages.length });

    // Use a transaction to ensure atomicity
    this.db.run("BEGIN TRANSACTION");

    try {
      // Delete existing messages (parts cascade-delete)
      this.db.run(`DELETE FROM messages WHERE conversation_id = ?`, [conversationId]);

      // Insert new messages with their parts
      for (const message of messages) {
        const messageId = message.id ?? generateId();

        this.db.run(
          `INSERT INTO messages (id, conversation_id, role, channel_name) VALUES (?, ?, ?, ?)`,
          [messageId, conversationId, message.role, null]
        );

        // Insert all parts
        for (let i = 0; i < message.parts.length; i++) {
          const part = message.parts[i];
          if (part) {
            this.db.run(
              `INSERT INTO message_parts (message_id, part_index, part_type, part_data) VALUES (?, ?, ?, ?)`,
              [messageId, i, part.type, JSON.stringify(part)]
            );
          }
        }
      }

      // Update conversation timestamp
      this.db.run(
        `UPDATE conversations SET updated_at = unixepoch() WHERE id = ?`,
        [conversationId]
      );

      this.db.run("COMMIT");
    } catch (err) {
      this.db.run("ROLLBACK");
      throw err;
    }
  }

  /** @inheritdoc */
  async clearHistory(conversationId: string): Promise<void> {
    logger.info("Store", "Clearing conversation history", { conversationId });
    // Messages and parts cascade-delete due to FK constraint
    this.db.run(`DELETE FROM messages WHERE conversation_id = ?`, [
      conversationId,
    ]);
    this.db.run(`DELETE FROM conversations WHERE id = ?`, [conversationId]);
  }

  /** @inheritdoc */
  async createMessage(
    conversationId: string,
    role: "user" | "assistant",
    meta?: MessageMeta
  ): Promise<string> {
    const messageId = generateId();

    this.ensureConversation(conversationId, meta);

    this.db.run(
      `INSERT INTO messages (id, conversation_id, role, channel_name) VALUES (?, ?, ?, ?)`,
      [messageId, conversationId, role, meta?.channelName ?? null]
    );

    return messageId;
  }

  /** @inheritdoc */
  async appendPart(messageId: string, part: PandoraMessagePart): Promise<void> {
    // Get next part index
    const result = this.db
      .query<{ max_index: number | null }, [string]>(
        `SELECT MAX(part_index) as max_index FROM message_parts WHERE message_id = ?`
      )
      .get(messageId);

    const nextIndex = (result?.max_index ?? -1) + 1;

    this.db.run(
      `INSERT INTO message_parts (message_id, part_index, part_type, part_data) VALUES (?, ?, ?, ?)`,
      [messageId, nextIndex, part.type, JSON.stringify(part)]
    );

    // Update conversation timestamp
    this.db.run(
      `UPDATE conversations SET updated_at = unixepoch()
       WHERE id = (SELECT conversation_id FROM messages WHERE id = ?)`,
      [messageId]
    );
  }

  /** @inheritdoc */
  async updateToolResult(
    messageId: string,
    toolCallId: string,
    result: unknown
  ): Promise<void> {
    // Find the tool part with matching toolCallId
    const parts = this.db
      .query<PartRow, [string]>(
        `SELECT id, part_index, part_type, part_data FROM message_parts
         WHERE message_id = ? AND part_type = 'dynamic-tool'
         ORDER BY part_index ASC`
      )
      .all(messageId);

    for (const partRow of parts) {
      const partData = JSON.parse(partRow.part_data);
      if (partData.toolCallId === toolCallId) {
        // Update state and add output
        partData.state = "output-available";
        partData.output = result;

        this.db.run(
          `UPDATE message_parts SET part_data = ? WHERE id = ?`,
          [JSON.stringify(partData), partRow.id]
        );
        break;
      }
    }
  }

  /** @inheritdoc */
  async updateTextPart(messageId: string, text: string): Promise<void> {
    // Find the last text part and update its content
    const part = this.db
      .query<PartRow, [string]>(
        `SELECT id, part_data FROM message_parts
         WHERE message_id = ? AND part_type = 'text'
         ORDER BY part_index DESC
         LIMIT 1`
      )
      .get(messageId);

    if (part) {
      const partData = JSON.parse(part.part_data);
      partData.text = text;
      this.db.run(
        `UPDATE message_parts SET part_data = ? WHERE id = ?`,
        [JSON.stringify(partData), part.id]
      );
    }
  }

  /** @inheritdoc */
  async finalizeMessage(messageId: string): Promise<void> {
    // Find all text parts that are streaming and finalize them
    const parts = this.db
      .query<PartRow, [string]>(
        `SELECT id, part_data FROM message_parts
         WHERE message_id = ? AND part_type = 'text'`
      )
      .all(messageId);

    for (const partRow of parts) {
      const partData = JSON.parse(partRow.part_data);
      if (partData.state === "streaming") {
        partData.state = "done";
        this.db.run(
          `UPDATE message_parts SET part_data = ? WHERE id = ?`,
          [JSON.stringify(partData), partRow.id]
        );
      }
    }
  }

  /** @inheritdoc */
  async accumulateUsage(
    messageId: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      reasoningTokens?: number;
    },
    modelId?: string
  ): Promise<void> {
    // Update usage and optionally set model_id (only if provided and not already set)
    if (modelId) {
      this.db.run(
        `UPDATE messages SET
          model_id = COALESCE(model_id, ?),
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          total_tokens = total_tokens + ?,
          cache_read_tokens = cache_read_tokens + ?,
          cache_write_tokens = cache_write_tokens + ?,
          reasoning_tokens = reasoning_tokens + ?
         WHERE id = ?`,
        [
          modelId,
          usage.inputTokens ?? 0,
          usage.outputTokens ?? 0,
          usage.totalTokens ?? 0,
          usage.cacheReadTokens ?? 0,
          usage.cacheWriteTokens ?? 0,
          usage.reasoningTokens ?? 0,
          messageId,
        ]
      );
    } else {
      this.db.run(
        `UPDATE messages SET
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          total_tokens = total_tokens + ?,
          cache_read_tokens = cache_read_tokens + ?,
          cache_write_tokens = cache_write_tokens + ?,
          reasoning_tokens = reasoning_tokens + ?
         WHERE id = ?`,
        [
          usage.inputTokens ?? 0,
          usage.outputTokens ?? 0,
          usage.totalTokens ?? 0,
          usage.cacheReadTokens ?? 0,
          usage.cacheWriteTokens ?? 0,
          usage.reasoningTokens ?? 0,
          messageId,
        ]
      );
    }
  }

  /** @inheritdoc */
  async getConversationUsage(conversationId: string): Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    messageCount: number;
  }> {
    type UsageRow = {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      reasoning_tokens: number;
      message_count: number;
    };

    const row = this.db
      .query<UsageRow, [string]>(
        `SELECT
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
          COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
          COUNT(*) as message_count
         FROM messages
         WHERE conversation_id = ?`
      )
      .get(conversationId);

    return {
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
      totalTokens: row?.total_tokens ?? 0,
      cacheReadTokens: row?.cache_read_tokens ?? 0,
      cacheWriteTokens: row?.cache_write_tokens ?? 0,
      reasoningTokens: row?.reasoning_tokens ?? 0,
      messageCount: row?.message_count ?? 0,
    };
  }

  /** @inheritdoc */
  async getLastMessageUsage(conversationId: string): Promise<{ inputTokens: number; outputTokens: number } | null> {
    type UsageRow = { input_tokens: number; output_tokens: number };
    const row = this.db
      .query<UsageRow, [string]>(
        `SELECT input_tokens, output_tokens
         FROM messages
         WHERE conversation_id = ? AND role = 'assistant' AND input_tokens > 0
         ORDER BY rowid DESC
         LIMIT 1`
      )
      .get(conversationId);

    if (!row) return null;
    return { inputTokens: row.input_tokens, outputTokens: row.output_tokens };
  }

  /** @inheritdoc */
  async listConversations(channelName?: string): Promise<ConversationInfo[]> {
    // Get first text content from first user message for preview
    // Exclude subagent threads from the main list
    const sql = channelName
      ? `SELECT c.id, c.channel_name, c.created_at, c.updated_at,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
         FROM conversations c
         WHERE c.channel_name = ? AND c.type = 'root'
         ORDER BY c.updated_at DESC`
      : `SELECT c.id, c.channel_name, c.created_at, c.updated_at,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
         FROM conversations c
         WHERE c.type = 'root'
         ORDER BY c.updated_at DESC`;

    type Row = {
      id: string;
      channel_name: string | null;
      created_at: number;
      updated_at: number;
      message_count: number;
    };

    const rows = channelName
      ? this.db.query<Row, [string]>(sql).all(channelName)
      : this.db.query<Row, []>(sql).all();

    // Get preview for each conversation (first text from first user message)
    const results: ConversationInfo[] = [];

    for (const row of rows) {
      let preview = "";

      // Get first user message (use rowid for correct insertion order)
      const firstUserMsg = this.db
        .query<{ id: string }, [string]>(
          `SELECT id FROM messages
           WHERE conversation_id = ? AND role = 'user'
           ORDER BY rowid ASC
           LIMIT 1`
        )
        .get(row.id);

      if (firstUserMsg) {
        // Get first text part from that message
        const textPart = this.db
          .query<{ part_data: string }, [string]>(
            `SELECT part_data FROM message_parts
             WHERE message_id = ? AND part_type = 'text'
             ORDER BY part_index ASC
             LIMIT 1`
          )
          .get(firstUserMsg.id);

        if (textPart) {
          const data = JSON.parse(textPart.part_data);
          preview = (data.text ?? "").slice(0, 100);
        }
      }

      results.push({
        id: row.id,
        channelName: row.channel_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        preview,
        messageCount: row.message_count,
      });
    }

    return results;
  }

  /** @inheritdoc */
  async deleteConversation(conversationId: string): Promise<void> {
    logger.info("Store", "Deleting conversation", { conversationId });
    // Messages and parts cascade-delete due to FK constraint
    this.db.run(`DELETE FROM conversations WHERE id = ?`, [conversationId]);
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    logger.info("Store", "Closing SQLite store");
    this.db.close();
  }

  /** @inheritdoc */
  async createSubagentConversation(
    parentId: string,
    toolCallId: string,
    subagentName: string,
    meta?: MessageMeta
  ): Promise<string> {
    const conversationId = generateId();

    this.db.run(
      `INSERT INTO conversations (id, channel_name, user_id, type, parent_conversation_id, parent_tool_call_id, subagent_name)
       VALUES (?, ?, ?, 'subagent', ?, ?, ?)`,
      [
        conversationId,
        meta?.channelName ?? null,
        meta?.userId ?? null,
        parentId,
        toolCallId,
        subagentName,
      ]
    );

    return conversationId;
  }

  /** @inheritdoc */
  async linkToolToThread(
    messageId: string,
    toolCallId: string,
    threadId: string
  ): Promise<void> {
    // Find the tool part with matching toolCallId and add threadId
    const parts = this.db
      .query<PartRow, [string]>(
        `SELECT id, part_index, part_type, part_data FROM message_parts
         WHERE message_id = ? AND part_type = 'dynamic-tool'
         ORDER BY part_index ASC`
      )
      .all(messageId);

    for (const partRow of parts) {
      const partData = JSON.parse(partRow.part_data);
      if (partData.toolCallId === toolCallId) {
        partData.threadId = threadId;

        this.db.run(`UPDATE message_parts SET part_data = ? WHERE id = ?`, [
          JSON.stringify(partData),
          partRow.id,
        ]);
        break;
      }
    }
  }

  /** @inheritdoc */
  async getChildThreads(conversationId: string): Promise<ConversationInfo[]> {
    type Row = {
      id: string;
      channel_name: string | null;
      type: string;
      parent_conversation_id: string | null;
      parent_tool_call_id: string | null;
      subagent_name: string | null;
      created_at: number;
      updated_at: number;
      message_count: number;
    };

    const rows = this.db
      .query<Row, [string]>(
        `SELECT c.id, c.channel_name, c.type, c.parent_conversation_id,
                c.parent_tool_call_id, c.subagent_name, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
         FROM conversations c
         WHERE c.parent_conversation_id = ?
         ORDER BY c.created_at ASC`
      )
      .all(conversationId);

    return rows.map((row) => ({
      id: row.id,
      channelName: row.channel_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      preview: "",
      messageCount: row.message_count,
      type: row.type as "root" | "subagent",
      parentConversationId: row.parent_conversation_id ?? undefined,
      parentToolCallId: row.parent_tool_call_id ?? undefined,
      subagentName: row.subagent_name ?? undefined,
    }));
  }

  // === Scheduled Task Methods ===

  /** @inheritdoc */
  async createScheduledTask(input: CreateScheduledTaskInput): Promise<string> {
    const taskId = generateId();

    this.db.run(
      `INSERT INTO scheduled_tasks (
        id, conversation_id, channel_name, user_id,
        type, task_type, description, context,
        run_at, cron_expression, timezone, max_runs, max_failures
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        input.conversationId,
        input.channelName,
        input.userId,
        input.type,
        input.taskType,
        input.description,
        input.context ? JSON.stringify(input.context) : null,
        input.runAt ?? null,
        input.cronExpression ?? null,
        input.timezone ?? "UTC",
        input.maxRuns ?? null,
        input.maxFailures ?? 3,
      ]
    );

    logger.info("Store", "Created scheduled task", { taskId, type: input.type, taskType: input.taskType });
    return taskId;
  }

  /** @inheritdoc */
  async getScheduledTask(taskId: string): Promise<ScheduledTask | null> {
    type TaskRow = {
      id: string;
      conversation_id: string;
      channel_name: string;
      user_id: string;
      type: string;
      task_type: string;
      description: string;
      context: string | null;
      run_at: number | null;
      cron_expression: string | null;
      timezone: string;
      status: string;
      last_run_at: number | null;
      run_count: number;
      max_runs: number | null;
      last_error: string | null;
      failure_count: number;
      max_failures: number;
      created_at: number;
      updated_at: number;
    };

    const row = this.db
      .query<TaskRow, [string]>(
        `SELECT * FROM scheduled_tasks WHERE id = ?`
      )
      .get(taskId);

    if (!row) return null;

    return this.rowToScheduledTask(row);
  }

  /** @inheritdoc */
  async updateScheduledTask(taskId: string, updates: UpdateScheduledTaskInput): Promise<void> {
    const setClauses: string[] = ["updated_at = unixepoch()"];
    const values: (string | number | null)[] = [];

    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.lastRunAt !== undefined) {
      setClauses.push("last_run_at = ?");
      values.push(updates.lastRunAt);
    }
    if (updates.runCount !== undefined) {
      setClauses.push("run_count = ?");
      values.push(updates.runCount);
    }
    if (updates.lastError !== undefined) {
      setClauses.push("last_error = ?");
      values.push(updates.lastError);
    }
    if (updates.failureCount !== undefined) {
      setClauses.push("failure_count = ?");
      values.push(updates.failureCount);
    }

    if (setClauses.length === 1) return; // Only updated_at, no actual updates

    values.push(taskId);

    this.db.run(
      `UPDATE scheduled_tasks SET ${setClauses.join(", ")} WHERE id = ?`,
      values
    );

    logger.debug("Store", "Updated scheduled task", { taskId, updates });
  }

  /** @inheritdoc */
  async deleteScheduledTask(taskId: string): Promise<void> {
    this.db.run(`DELETE FROM scheduled_tasks WHERE id = ?`, [taskId]);
    logger.info("Store", "Deleted scheduled task", { taskId });
  }

  /** @inheritdoc */
  async listScheduledTasks(conversationId: string): Promise<ScheduledTask[]> {
    type TaskRow = {
      id: string;
      conversation_id: string;
      channel_name: string;
      user_id: string;
      type: string;
      task_type: string;
      description: string;
      context: string | null;
      run_at: number | null;
      cron_expression: string | null;
      timezone: string;
      status: string;
      last_run_at: number | null;
      run_count: number;
      max_runs: number | null;
      last_error: string | null;
      failure_count: number;
      max_failures: number;
      created_at: number;
      updated_at: number;
    };

    const rows = this.db
      .query<TaskRow, [string]>(
        `SELECT * FROM scheduled_tasks
         WHERE conversation_id = ?
         ORDER BY created_at DESC`
      )
      .all(conversationId);

    return rows.map((row) => this.rowToScheduledTask(row));
  }

  /** @inheritdoc */
  async getPendingTasks(): Promise<ScheduledTask[]> {
    type TaskRow = {
      id: string;
      conversation_id: string;
      channel_name: string;
      user_id: string;
      type: string;
      task_type: string;
      description: string;
      context: string | null;
      run_at: number | null;
      cron_expression: string | null;
      timezone: string;
      status: string;
      last_run_at: number | null;
      run_count: number;
      max_runs: number | null;
      last_error: string | null;
      failure_count: number;
      max_failures: number;
      created_at: number;
      updated_at: number;
    };

    const rows = this.db
      .query<TaskRow, []>(
        `SELECT * FROM scheduled_tasks
         WHERE status = 'pending'
         ORDER BY run_at ASC NULLS LAST`
      )
      .all();

    return rows.map((row) => this.rowToScheduledTask(row));
  }

  /** Convert a database row to a ScheduledTask object */
  private rowToScheduledTask(row: {
    id: string;
    conversation_id: string;
    channel_name: string;
    user_id: string;
    type: string;
    task_type: string;
    description: string;
    context: string | null;
    run_at: number | null;
    cron_expression: string | null;
    timezone: string;
    status: string;
    last_run_at: number | null;
    run_count: number;
    max_runs: number | null;
    last_error: string | null;
    failure_count: number;
    max_failures: number;
    created_at: number;
    updated_at: number;
  }): ScheduledTask {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      channelName: row.channel_name,
      userId: row.user_id,
      type: row.type as "once" | "recurring",
      taskType: row.task_type as "reminder" | "followup" | "custom",
      description: row.description,
      context: row.context ? JSON.parse(row.context) : undefined,
      runAt: row.run_at ?? undefined,
      cronExpression: row.cron_expression ?? undefined,
      timezone: row.timezone,
      status: row.status as "pending" | "running" | "completed" | "cancelled" | "failed",
      lastRunAt: row.last_run_at ?? undefined,
      runCount: row.run_count,
      maxRuns: row.max_runs ?? undefined,
      lastError: row.last_error ?? undefined,
      failureCount: row.failure_count,
      maxFailures: row.max_failures,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// Self-register the store
export default defineStore({
  type: "sqlite",
  create: (config: StorageConfig) => new SqliteStore(config.path),
});
