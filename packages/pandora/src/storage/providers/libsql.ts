import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { LibSQLStore } from '@mastra/libsql'
import { createLibSQLConfigStore } from '../config-store'
import type { StorageResult } from '../index'

// Resolve to monorepo root: packages/pandora/src/storage/providers -> ../../../../../../data
const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..', '..')
const MONOREPO_ROOT = resolve(PACKAGE_ROOT, '..', '..')
const DEFAULT_DB_PATH = resolve(MONOREPO_ROOT, 'data', 'pandora.db')

/**
 * Ensure the directory for a file path exists.
 */
function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

/**
 * Create a LibSQL storage instance with shared client.
 *
 * Environment variables:
 * - DATABASE_URL: LibSQL connection URL (defaults to '<monorepo-root>/data/pandora.db')
 * - DATABASE_AUTH_TOKEN: Auth token for Turso cloud databases
 */
export async function createLibSQLStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  const url = env.DATABASE_URL ?? `file:${DEFAULT_DB_PATH}`

  // For local file URLs, ensure the directory exists
  if (url.startsWith('file:')) {
    const filePath = url.slice(5) // Remove 'file:' prefix
    ensureDir(filePath)
  }

  // Create shared client for both Mastra and Pandora config
  const client = createClient({
    url,
    authToken: env.DATABASE_AUTH_TOKEN,
  })

  // Mastra storage uses the shared client
  const mastra = new LibSQLStore({
    id: 'pandora-libsql',
    client,
  })

  // Pandora config uses the same client
  const config = createLibSQLConfigStore(client)

  return { mastra, config }
}
