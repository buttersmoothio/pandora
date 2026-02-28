import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { MastraVector } from '@mastra/core/vector'

export type { MastraVector } from '@mastra/core/vector'

export interface VectorResult {
  /** Mastra vector store for embeddings */
  vector: MastraVector
  /** Close connection (optional cleanup on shutdown) */
  close?(): Promise<void>
}

const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'pandora.db')

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

/**
 * Create vector instances using inline libsql.
 *
 * Uses `DATABASE_URL` env var if set, otherwise defaults to a local file database.
 */
export async function createVector(env: Record<string, string | undefined>): Promise<VectorResult> {
  const url = env.DATABASE_URL ?? `file:${DEFAULT_DB_PATH}`

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

  return { vector }
}
