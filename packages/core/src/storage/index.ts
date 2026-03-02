import type { MastraCompositeStore } from '@mastra/core/storage'
import type { AuthStore } from '../auth/auth-store'
import type { Config } from '../config'
import type { ConfigStore } from './config-store'

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

/**
 * Create storage instances.
 *
 * Currently uses LibSQL — swap the provider import to change backends.
 */
export async function createStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  const { createLibSQLStorage } = await import('./providers/libsql')
  return createLibSQLStorage(env)
}
