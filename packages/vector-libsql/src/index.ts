import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { LibSQLVector } from '@mastra/libsql'
import type { VectorPlugin } from '@pandora/core/vector'

// Resolve to monorepo root: packages/vector-libsql/src -> ../../../data
const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const MONOREPO_ROOT = resolve(PACKAGE_ROOT, '..', '..')
const DEFAULT_DB_PATH = resolve(MONOREPO_ROOT, 'data', 'pandora.db')

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

export default {
  id: 'vector-libsql',
  name: 'SQLite Vector',
  schemaVersion: 1,
  envVars: [],
  factory: async (env) => {
    const url = env.DATABASE_URL ?? `file:${DEFAULT_DB_PATH}`

    if (url.startsWith('file:')) {
      const filePath = url.slice(5)
      ensureDir(filePath)
    }

    const vector = new LibSQLVector({
      id: 'pandora-vector',
      url,
      authToken: env.DATABASE_AUTH_TOKEN,
    })

    return {
      vector,
    }
  },
} satisfies VectorPlugin
