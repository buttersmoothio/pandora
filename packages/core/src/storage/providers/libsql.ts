import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { InArgs } from '@libsql/client'
import type { Config } from '../../config'
import { getLogger } from '../../logger'
import type { StorageResult } from '../index'
import { SQLConfigStore } from './sql'

const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'pandora.db')

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

/**
 * Create storage using LibSQL (SQLite).
 *
 * Uses `DATABASE_URL` env var if set, otherwise defaults to a local file database.
 */
export async function createLibSQLStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  const log = getLogger(env)
  const url = env.DATABASE_URL ?? `file:${DEFAULT_DB_PATH}`
  log.debug('Storage initializing', { url: url.startsWith('file:') ? 'file (local)' : 'remote' })

  if (url.startsWith('file:')) {
    const filePath = url.slice(5)
    ensureDir(filePath)
  }

  // Dynamic imports to avoid SES lockdown conflicts —
  // @libsql/client touches EventEmitter prototypes at module level
  const { createClient } = await import('@libsql/client')
  const { LibSQLStore } = await import('@mastra/libsql')

  const client = createClient({
    url,
    authToken: env.DATABASE_AUTH_TOKEN,
  })

  const wrapExecute = async (sql: string, params?: unknown[]) => {
    const result = await client.execute(params ? { sql, args: params as InArgs } : sql)
    return result.rows as unknown[]
  }

  const mastra = new LibSQLStore({ id: 'pandora-libsql', client })
  const config = new SQLConfigStore<Config>(wrapExecute, 'sqlite')

  const { SQLAuthStore } = await import('../../auth/providers/sql')
  const auth = new SQLAuthStore(wrapExecute, 'sqlite')

  const { SQLInboxStore } = await import('./sql-inbox')
  const inbox = new SQLInboxStore(wrapExecute, 'sqlite')

  // Initialize stores
  await mastra.init()
  if (config.init) await config.init()
  await auth.init()
  await inbox.init()

  log.debug('Storage initialized')

  return {
    mastra,
    config,
    auth,
    inbox,
    close: async () => {
      client.close()
    },
  }
}
