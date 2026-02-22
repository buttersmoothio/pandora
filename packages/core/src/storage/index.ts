import type { MastraCompositeStore } from '@mastra/core/storage'
import type { AuthStore } from '../auth/auth-store'
import type { Config } from '../config'
import { isServerless } from '../env'
import type { ConfigFieldDescriptor } from '../plugin-types'
import { PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import type { ConfigStore } from './config-store'

export type { MastraCompositeStore, StorageDomains } from '@mastra/core/storage'
export type { AuthStore } from '../auth/auth-store'
export type { ConfigFieldDescriptor } from '../plugin-types'
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

export type StorageFactory = (
  env: Record<string, string | undefined>,
  bindings?: unknown,
) => Promise<StorageResult>

/** Plugin descriptor for storage providers */
export interface StoragePlugin {
  /** Unique plugin identifier, e.g. 'storage-libsql' */
  id: string
  /** Human-readable display name, e.g. 'SQLite' */
  name: string
  /** Schema version — must match core's expected version */
  schemaVersion: number
  /** Required environment variable names */
  envVars?: string[]
  /** Config field descriptors for the UI */
  configFields?: ConfigFieldDescriptor[]
  /** Factory that creates storage instances */
  factory: StorageFactory
}

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const providers = new Map<string, StoragePlugin>()

/**
 * Register a storage plugin.
 *
 * Must be called before any request that uses storage.
 * Validates schema version compatibility on registration.
 */
export function registerStoragePlugin(plugin: StoragePlugin): void {
  if (plugin.schemaVersion !== PLUGIN_SCHEMA_VERSION) {
    throw new Error(
      `Storage plugin '${plugin.id}' uses schema v${plugin.schemaVersion}, ` +
        `but core expects v${PLUGIN_SCHEMA_VERSION}. Update the package.`,
    )
  }
  providers.set(plugin.id, plugin)
}

/** @deprecated Use `registerStoragePlugin` */
export const registerStorageProvider = registerStoragePlugin

/** Get all registered storage plugins (regardless of load status) */
export function getAllRegisteredStoragePlugins(): StoragePlugin[] {
  return [...providers.values()]
}

// ---------------------------------------------------------------------------
// Instance cache & creation
// ---------------------------------------------------------------------------

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
 * Create new storage instances from the registered provider.
 *
 * Selects the provider by `STORAGE_PROVIDER` env var (default: `'storage-libsql'`).
 * The provider must have been registered via `registerStoragePlugin()`.
 */
async function createStorage(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<StorageResult> {
  const id = env.STORAGE_PROVIDER ?? 'storage-libsql'
  const plugin = providers.get(id)

  if (!plugin) {
    const registered = [...providers.keys()]
    throw new Error(
      `Storage provider '${id}' is not registered.\n` +
        `Register it with registerStoragePlugin() before starting the server.\n` +
        (registered.length > 0
          ? `Registered providers: ${registered.join(', ')}`
          : 'No providers registered.'),
    )
  }

  const result = await plugin.factory(env, bindings)
  await result.mastra.init()
  if (result.config.init) {
    await result.config.init()
  }
  await result.auth.init()
  return result
}

/**
 * Clear the cached storage instance. Useful for testing or reconnecting.
 */
export async function clearStorageCache(): Promise<void> {
  await _cached?.close?.()
  _cached = null
}

/**
 * Clear the plugin registry. Useful for testing.
 */
export function clearStoragePlugins(): void {
  providers.clear()
}

/** @deprecated Use `clearStoragePlugins` */
export const clearStorageProviders = clearStoragePlugins
