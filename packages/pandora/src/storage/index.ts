import type { MastraCompositeStore } from '@mastra/core/storage'
import { isServerless } from '../env'
import type { ConfigStore } from './config-store'

export type { MastraCompositeStore, StorageDomains } from '@mastra/core/storage'
export type { ConfigStore } from './config-store'

/**
 * Combined storage result with both Mastra domains and Pandora config
 */
export interface StorageResult {
  /** Mastra storage for memory, workflows, etc. */
  mastra: MastraCompositeStore
  /** Pandora config storage */
  config: ConfigStore
}

type StorageFactory = (
  env: Record<string, string | undefined>,
  bindings?: unknown,
) => Promise<StorageResult>

/** Map of provider names to their npm packages */
const PROVIDER_PACKAGES: Record<string, string> = {
  libsql: '@mastra/libsql',
  postgres: '@mastra/pg',
  upstash: '@mastra/upstash',
  mongodb: '@mastra/mongodb',
  dynamodb: '@mastra/dynamodb',
  mssql: '@mastra/mssql',
}

/** Lazy-loaded provider factories */
const providers: Record<string, () => Promise<StorageFactory>> = {
  libsql: () => import('./providers/libsql').then((m) => m.createLibSQLStorage),
  postgres: () => import('./providers/postgres').then((m) => m.createPostgresStorage),
  upstash: () => import('./providers/upstash').then((m) => m.createUpstashStorage),
  mongodb: () => import('./providers/mongodb').then((m) => m.createMongoDBStorage),
  dynamodb: () => import('./providers/dynamodb').then((m) => m.createDynamoDBStorage),
  mssql: () => import('./providers/mssql').then((m) => m.createMSSQLStorage),
}

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
 */
async function createStorage(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<StorageResult> {
  const provider = env.STORAGE_PROVIDER ?? 'libsql'
  const factoryLoader = providers[provider]

  if (!factoryLoader) {
    const supported = Object.keys(providers).join(', ')
    throw new Error(`Unknown storage provider: ${provider}. Supported: ${supported}`)
  }

  try {
    const factory = await factoryLoader()
    const result = await factory(env, bindings)
    await result.mastra.init()
    if (result.config.init) {
      await result.config.init()
    }
    return result
  } catch (err) {
    // Provide helpful message if package is not installed
    if (err instanceof Error && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND') {
      const pkg = PROVIDER_PACKAGES[provider]
      throw new Error(
        `Storage provider '${provider}' requires ${pkg}\n` + `Install it with: bun add ${pkg}`,
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

/**
 * Get list of supported storage providers
 */
export function getSupportedProviders(): string[] {
  return Object.keys(providers)
}
