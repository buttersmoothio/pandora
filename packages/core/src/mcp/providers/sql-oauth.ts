import type { McpOAuthStore } from '../oauth-store'

const TABLE_NAME = 'pandora_mcp_oauth'

/**
 * SQL-based OAuth store for MCP server credentials.
 * Uses a simple key-value table — dialect-agnostic via generic `execute`.
 */
export class SQLMcpOAuthStore implements McpOAuthStore {
  constructor(
    private execute: (sql: string, params?: unknown[]) => Promise<unknown[]>,
    private dialect: 'sqlite' | 'postgres' | 'mssql' = 'sqlite',
  ) {}

  private get createTableSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `
          CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `
      case 'mssql':
        return `
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${TABLE_NAME}' AND xtype='U')
          CREATE TABLE ${TABLE_NAME} (
            [key] NVARCHAR(255) PRIMARY KEY,
            value NVARCHAR(MAX) NOT NULL,
            updated_at DATETIME2 DEFAULT GETUTCDATE()
          )
        `
      default:
        return `
          CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `
    }
  }

  private get upsertSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `
          INSERT INTO ${TABLE_NAME} (key, value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        `
      case 'mssql':
        return `
          MERGE ${TABLE_NAME} AS target
          USING (SELECT @p1 AS [key], @p2 AS value) AS source
          ON target.[key] = source.[key]
          WHEN MATCHED THEN UPDATE SET value = source.value, updated_at = GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (source.[key], source.value);
        `
      default:
        return `
          INSERT INTO ${TABLE_NAME} (key, value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `
    }
  }

  private get selectSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `SELECT value FROM ${TABLE_NAME} WHERE key = $1`
      case 'mssql':
        return `SELECT value FROM ${TABLE_NAME} WHERE [key] = @p1`
      default:
        return `SELECT value FROM ${TABLE_NAME} WHERE key = ?`
    }
  }

  private get deleteSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `DELETE FROM ${TABLE_NAME} WHERE key = $1`
      case 'mssql':
        return `DELETE FROM ${TABLE_NAME} WHERE [key] = @p1`
      default:
        return `DELETE FROM ${TABLE_NAME} WHERE key = ?`
    }
  }

  async init(): Promise<void> {
    await this.execute(this.createTableSQL)
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const rows = await this.execute(this.selectSQL, [key])
      if (!rows || rows.length === 0) return undefined
      return (rows[0] as { value: string }).value
    } catch {
      return undefined
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.execute(this.upsertSQL, [key, value])
  }

  async delete(key: string): Promise<void> {
    try {
      await this.execute(this.deleteSQL, [key])
    } catch {
      // Table might not exist
    }
  }
}
