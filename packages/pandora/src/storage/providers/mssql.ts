import { MSSQLStore } from '@mastra/mssql'
import sql from 'mssql'
import { createMSSQLConfigStore } from '../config-store'
import type { StorageResult } from '../index'

/**
 * Microsoft SQL Server storage provider with shared pool.
 *
 * Requires: bun add @mastra/mssql mssql
 *
 * Environment variables:
 * - DATABASE_URL: MSSQL connection string
 */
export async function createMSSQLStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for MSSQL storage')
  }

  // Create shared connection pool
  const pool = new sql.ConnectionPool(env.DATABASE_URL)
  await pool.connect()

  const mastra = new MSSQLStore({
    id: 'pandora-mssql',
    pool,
  })

  // Pandora config uses the same pool
  const config = createMSSQLConfigStore(pool)

  return { mastra, config }
}
