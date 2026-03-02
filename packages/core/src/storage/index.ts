import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { InArgs } from '@libsql/client'
import type { MastraCompositeStore } from '@mastra/core/storage'
import type { AuthStore } from '../auth/auth-store'
import { SQLAuthStore } from '../auth/auth-stores/sql'
import type { Config } from '../config'
import { getLogger } from '../logger'
import type { ConfigStore } from './config-store'
import { SQLConfigStore } from './config-stores/sql'

export type { MastraCompositeStore, StorageDomains } from '@mastra/core/storage'
export type { AuthStore } from '../auth/auth-store'
export type { ConfigStore } from './config-store'

/**
 * Combined storage result with both Mastra domains and Pandora config
 */
export interface StorageResult {
  /** Mastra storage for memory, workflows, etc. */
  mastra: MastraCompositeStore
  /** Pandora config storage */
  config: ConfigStore<Config>
  /** Pandora auth storage */
  auth: AuthStore
  /** Close all connections (optional cleanup on shutdown) */
  close?(): Promise<void>
}

const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'pandora.db')

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function createLibSQLConfigStore(client: {
  execute: (arg: string | { sql: string; args: InArgs }) => Promise<{ rows: unknown[] }>
}): SQLConfigStore<Config> {
  return new SQLConfigStore<Config>(async (sql, params) => {
    const result = await client.execute(params ? { sql, args: params as InArgs } : sql)
    return result.rows as unknown[]
  }, 'sqlite')
}

/**
 * Create storage instances using inline libsql.
 *
 * Uses `DATABASE_URL` env var if set, otherwise defaults to a local file database.
 */
export async function createStorage(
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

  const mastra = new LibSQLStore({
    id: 'pandora-libsql',
    client,
  })

  const config = createLibSQLConfigStore(client)

  const auth = new SQLAuthStore(async (sql, params) => {
    const result = await client.execute(params ? { sql, args: params as InArgs } : sql)
    return result.rows as unknown[]
  }, 'sqlite')

  // Initialize stores
  await mastra.init()
  if (config.init) {
    await config.init()
  }
  await auth.init()

  log.debug('Storage initialized')

  return {
    mastra,
    config,
    auth,
    close: async () => {
      client.close()
    },
  }
}
