import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getLogger } from '../../logger'
import type { VectorResult } from '../index'

const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'pandora.db')

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

/**
 * Create vector store using LibSQL (SQLite).
 *
 * Uses `DATABASE_URL` env var if set, otherwise defaults to a local file database.
 */
export async function createLibSQLVector(
  env: Record<string, string | undefined>,
): Promise<VectorResult> {
  const log = getLogger(env)
  const url = env.DATABASE_URL ?? `file:${DEFAULT_DB_PATH}`
  log.debug('Vector store initializing')

  if (url.startsWith('file:')) {
    const filePath = url.slice(5)
    ensureDir(filePath)
  }

  // Dynamic import to avoid SES lockdown conflicts
  const { LibSQLVector } = await import('@mastra/libsql')

  const vector = new LibSQLVector({
    id: 'pandora-vector',
    url,
    authToken: env.DATABASE_AUTH_TOKEN,
  })

  log.debug('Vector store initialized')
  return { vector }
}
