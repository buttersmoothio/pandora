import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { InArgs } from '@libsql/client'
import { createClient } from '@libsql/client'
import { LibSQLStore } from '@mastra/libsql'
import type { Config, StorageFactory, StoragePlugin } from '@pandora/core/storage'
import { SQLAuthStore, SQLConfigStore } from '@pandora/core/storage'

// Resolve to monorepo root: packages/storage-libsql/src -> ../../../data
const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const MONOREPO_ROOT = resolve(PACKAGE_ROOT, '..', '..')
const DEFAULT_DB_PATH = resolve(MONOREPO_ROOT, 'data', 'pandora.db')

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

export const createStorage: StorageFactory = async (env) => {
  const url = env.DATABASE_URL ?? `file:${DEFAULT_DB_PATH}`

  if (url.startsWith('file:')) {
    const filePath = url.slice(5)
    ensureDir(filePath)
  }

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

  return {
    mastra,
    config,
    auth,
    close: async () => {
      client.close()
    },
  }
}

export default {
  id: 'storage-libsql',
  schemaVersion: 1,
  factory: createStorage,
} satisfies StoragePlugin
