import { PostgresStore } from '@mastra/pg'
import { Pool } from 'pg'
import { createPostgresConfigStore } from '../config-store'
import type { StorageResult } from '../index'

/**
 * PostgreSQL storage provider with shared pool.
 *
 * Requires: bun add @mastra/pg pg
 *
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection string
 */
export async function createPostgresStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL storage')
  }

  // Create shared pool for both Mastra and Pandora config
  const pool = new Pool({ connectionString: env.DATABASE_URL })

  // Mastra storage uses the shared pool
  const mastra = new PostgresStore({
    id: 'pandora-postgres',
    pool,
  })

  // Pandora config uses the same pool
  const config = createPostgresConfigStore(pool)

  return { mastra, config }
}
