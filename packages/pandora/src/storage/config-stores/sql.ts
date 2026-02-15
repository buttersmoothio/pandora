import type { Config, ConfigStore } from '../config-store'

const TABLE_NAME = 'pandora_config'
const CONFIG_KEY = 'main'

/**
 * SQL-based config store for LibSQL, PostgreSQL, MSSQL, D1.
 * Uses a simple key-value table with JSON storage.
 */
export class SQLConfigStore implements ConfigStore {
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
            value JSONB NOT NULL,
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
      default: // sqlite/libsql
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
      default: // sqlite/libsql
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

  async get(): Promise<Config | null> {
    try {
      const rows = await this.execute(this.selectSQL, [CONFIG_KEY])
      if (!rows || rows.length === 0) return null

      const row = rows[0] as { value: string | object }
      const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
      return value as Config
    } catch {
      // Table might not exist yet
      return null
    }
  }

  async set(config: Config): Promise<void> {
    const value = this.dialect === 'postgres' ? config : JSON.stringify(config)
    await this.execute(this.upsertSQL, [CONFIG_KEY, value])
  }

  async delete(): Promise<void> {
    try {
      await this.execute(this.deleteSQL, [CONFIG_KEY])
    } catch {
      // Table might not exist
    }
  }
}

import type { InArgs, Client as LibSQLClient } from '@libsql/client'
import type { ConnectionPool as MSSQLPool } from 'mssql'
import type { Pool as PgPool } from 'pg'

/**
 * Create a SQLConfigStore from a LibSQL client
 */
export function createLibSQLConfigStore(client: LibSQLClient): SQLConfigStore {
  return new SQLConfigStore(async (sql, params) => {
    const result = await client.execute(params ? { sql, args: params as InArgs } : sql)
    return result.rows as unknown[]
  }, 'sqlite')
}

/**
 * Create a SQLConfigStore from a PostgreSQL pool/client
 */
export function createPostgresConfigStore(pool: PgPool): SQLConfigStore {
  return new SQLConfigStore(async (sql, params) => {
    const result = await pool.query(sql, params)
    return result.rows
  }, 'postgres')
}

/**
 * Create a SQLConfigStore from an MSSQL pool
 */
export function createMSSQLConfigStore(pool: MSSQLPool): SQLConfigStore {
  return new SQLConfigStore(async (query, params) => {
    const request = pool.request()
    if (params) {
      for (let i = 0; i < params.length; i++) {
        request.input(`p${i + 1}`, params[i])
      }
    }
    const result = await request.query(query)
    return result.recordset
  }, 'mssql')
}
