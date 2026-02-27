import { PostgresStore } from '@mastra/pg'
import type { Config, StorageFactory } from '@pandora/core/storage'
import { SQLAuthStore, SQLConfigStore } from '@pandora/core/storage'
import { Pool } from 'pg'

export const factory: StorageFactory = async (env) => {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL storage')
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL })

  const mastra = new PostgresStore({
    id: 'pandora-postgres',
    pool,
  })

  const config = new SQLConfigStore<Config>(async (sql, params) => {
    const result = await pool.query(sql, params)
    return result.rows
  }, 'postgres')

  const auth = new SQLAuthStore(async (sql, params) => {
    const result = await pool.query(sql, params)
    return result.rows
  }, 'postgres')

  return { mastra, config, auth, close: () => pool.end() }
}

/** @deprecated Use `factory` */
export const createStorage = factory
