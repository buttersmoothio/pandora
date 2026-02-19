import type { MastraCompositeStore } from '@mastra/core/storage'
import type { AuthStore } from '../auth/auth-store'
import type { Config } from '../config'
import { isServerless } from '../env'
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
}

export type StorageFactory = (
  env: Record<string, string | undefined>,
  bindings?: unknown,
) => Promise<StorageResult>

/** Cached storage instance for server mode */
let _cached: StorageResult | null = null

/**
 * Get storage instances. In server mode, caches for process lifetime.
 * In serverless mode, creates fresh instances per request.
 *
 * @param env - Environment variables (use `env(c)` from Hono adapter)
 * @param bindings - Cloudflare bindings (use `c.env` in Workers)
 * @returns Both Mastra storage and Pandora config store
 */
export async function getStorage(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<StorageResult> {
  const serverless = isServerless()

  // Serverless: fresh instance per request
  if (serverless) {
    return createStorage(env, bindings)
  }

  // Server: cache instance for process lifetime
  if (!_cached) {
    _cached = await createStorage(env, bindings)
  }
  return _cached
}

/**
 * Create new storage instances based on STORAGE_PROVIDER env var.
 * Defaults to 'libsql' if not specified.
 *
 * Uses convention-based discovery: imports `@pandora/storage-${provider}`.
 */
async function createStorage(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<StorageResult> {
  const provider = env.STORAGE_PROVIDER ?? 'libsql'

  try {
    const mod = (await import(`@pandora/storage-${provider}`)) as { createStorage: StorageFactory }
    const result = await mod.createStorage(env, bindings)
    await result.mastra.init()
    if (result.config.init) {
      await result.config.init()
    }
    await result.auth.init()
    return result
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        `Storage provider '${provider}' requires @pandora/storage-${provider}\n` +
          `Install it with: bun add @pandora/storage-${provider}`,
      )
    }
    throw err
  }
}

/**
 * Clear the cached storage instance. Useful for testing or reconnecting.
 */
export function clearStorageCache(): void {
  _cached = null
}
