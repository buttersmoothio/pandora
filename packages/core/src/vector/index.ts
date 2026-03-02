import type { MastraVector } from '@mastra/core/vector'

export type { MastraVector } from '@mastra/core/vector'

export interface VectorResult {
  /** Mastra vector store for embeddings */
  vector: MastraVector
  /** Close connection (optional cleanup on shutdown) */
  close?(): Promise<void>
}

/**
 * Create vector store.
 *
 * Currently uses LibSQL — swap the provider import to change backends.
 */
export async function createVector(env: Record<string, string | undefined>): Promise<VectorResult> {
  const { createLibSQLVector } = await import('./providers/libsql')
  return createLibSQLVector(env)
}
