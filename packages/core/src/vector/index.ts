import type { MastraVector } from '@mastra/core/vector'
import { isServerless } from '../env'
import type { ConfigFieldDescriptor, EnvVarDescriptor } from '../plugin-types'
import { PLUGIN_SCHEMA_VERSION } from '../plugin-types'

export type { MastraVector } from '@mastra/core/vector'
export type { ConfigFieldDescriptor, EnvVarDescriptor } from '../plugin-types'

/**
 * Combined vector result from a vector plugin
 */
export interface VectorResult {
  /** Mastra vector store for embeddings */
  vector: MastraVector
  /** Close connection (optional cleanup on shutdown) */
  close?(): Promise<void>
}

export type VectorFactory = (
  env: Record<string, string | undefined>,
  bindings?: unknown,
) => Promise<VectorResult>

/** Plugin descriptor for vector providers */
export interface VectorPlugin {
  /** Unique plugin identifier, e.g. 'vector-libsql' */
  id: string
  /** Human-readable display name, e.g. 'SQLite Vector' */
  name: string
  /** Short description */
  description?: string
  /** Plugin author name */
  author?: string
  /** URL to an icon image */
  icon?: string
  /** Plugin version string */
  version?: string
  /** Project homepage URL */
  homepage?: string
  /** Source code repository URL */
  repository?: string
  /** License identifier */
  license?: string
  /** Schema version — must match core's expected version */
  schemaVersion: number
  /** Environment variables this plugin depends on */
  envVars?: EnvVarDescriptor[]
  /** Config field descriptors for the UI */
  configFields?: ConfigFieldDescriptor[]
  /** Factory that creates vector instances */
  factory: VectorFactory
}

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const providers = new Map<string, VectorPlugin>()

/**
 * Register a vector plugin.
 *
 * Must be called before any request that uses vector storage.
 * Validates schema version compatibility on registration.
 */
export function registerVectorPlugin(plugin: VectorPlugin): void {
  if (plugin.schemaVersion !== PLUGIN_SCHEMA_VERSION) {
    throw new Error(
      `Vector plugin '${plugin.id}' uses schema v${plugin.schemaVersion}, ` +
        `but core expects v${PLUGIN_SCHEMA_VERSION}. Update the package.`,
    )
  }
  providers.set(plugin.id, plugin)
}

/** Get all registered vector plugins (regardless of load status) */
export function getAllRegisteredVectorPlugins(): VectorPlugin[] {
  return [...providers.values()]
}

// ---------------------------------------------------------------------------
// Instance cache & creation
// ---------------------------------------------------------------------------

/** Cached vector instance for server mode */
let _cached: VectorResult | null = null

/**
 * Get vector instances. In server mode, caches for process lifetime.
 * In serverless mode, creates fresh instances per request.
 *
 * @param env - Environment variables (use `env(c)` from Hono adapter)
 * @param bindings - Cloudflare bindings (use `c.env` in Workers)
 * @returns VectorResult or null if no vector plugin is registered
 */
export async function getVector(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<VectorResult | null> {
  const serverless = isServerless()

  // Serverless: fresh instance per request
  if (serverless) {
    return createVector(env, bindings)
  }

  // Server: cache instance for process lifetime
  if (!_cached) {
    _cached = await createVector(env, bindings)
  }
  return _cached
}

/**
 * Create new vector instances from the registered provider.
 *
 * Selects the provider by `VECTOR_PROVIDER` env var (default: `'vector-libsql'`).
 * The provider must have been registered via `registerVectorPlugin()`.
 * Returns null if no providers are registered (graceful degradation).
 */
async function createVector(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<VectorResult | null> {
  const id = env.VECTOR_PROVIDER ?? 'vector-libsql'
  const plugin = providers.get(id)

  // Graceful degradation: if no vector plugin is registered, return null
  if (!plugin) {
    if (providers.size === 0) {
      return null
    }
    const registered = [...providers.keys()]
    throw new Error(
      `Vector provider '${id}' is not registered.\n` +
        `Register it with registerVectorPlugin() before starting the server.\n` +
        `Registered providers: ${registered.join(', ')}`,
    )
  }

  return plugin.factory(env, bindings)
}

/**
 * Clear the cached vector instance. Useful for testing or reconnecting.
 */
export async function clearVectorCache(): Promise<void> {
  await _cached?.close?.()
  _cached = null
}

/**
 * Clear the plugin registry. Useful for testing.
 */
export function clearVectorPlugins(): void {
  providers.clear()
}
