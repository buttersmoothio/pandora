import { z } from 'zod'
import { isServerless } from './env'
import type { ConfigStore } from './storage/config-store'

/**
 * Model configuration for different use cases
 */
const ModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
})

/**
 * Main Pandora configuration schema
 */
export const ConfigSchema = z.object({
  /** Agent identity */
  identity: z
    .object({
      name: z.string(),
      description: z.string(),
      version: z.string(),
    })
    .default(() => ({
      name: 'Pandora',
      description: 'A multi-channel AI assistant',
      version: '0.1.0',
    })),

  /** Agent personality traits */
  personality: z
    .object({
      traits: z.array(z.string()),
      systemPrompt: z.string().optional(),
    })
    .default(() => ({
      traits: ['helpful', 'concise', 'friendly'],
    })),

  /** Model configurations */
  models: z
    .object({
      operator: ModelConfigSchema,
    })
    .default(() => ({
      operator: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
    })),

  /** Tool configurations — keyed by tool ID */
  tools: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean(),
        settings: z.record(z.string(), z.string()).optional(),
        requireApproval: z.boolean().optional(),
      }),
    )
    .default(() => ({
      'current-time': { enabled: true },
    })),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Default configuration values
 */
export const DEFAULTS: Config = ConfigSchema.parse({})

/**
 * In-memory config cache (server mode only)
 */
let _configCache: Config | null = null

/**
 * Load config from environment variables
 */
function loadFromEnv(envVars: Record<string, string | undefined>): Partial<Config> {
  const partial: Record<string, unknown> = {}

  // Identity
  if (envVars.PANDORA_NAME) {
    partial.identity = { ...(partial.identity as object), name: envVars.PANDORA_NAME }
  }
  if (envVars.PANDORA_DESCRIPTION) {
    partial.identity = { ...(partial.identity as object), description: envVars.PANDORA_DESCRIPTION }
  }

  return partial as Partial<Config>
}

/**
 * Deep merge two config objects
 */
function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base }

  for (const key of Object.keys(override) as Array<keyof T>) {
    const baseVal = base[key]
    const overrideVal = override[key]

    if (
      overrideVal !== undefined &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T]
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T]
    }
  }

  return result
}

/**
 * Get the current configuration.
 * Loads from storage + env vars, with caching in server mode.
 */
export async function getConfig(
  configStore: ConfigStore<Config>,
  envVars: Record<string, string | undefined> = {},
): Promise<Config> {
  // Return cached config in server mode
  if (!isServerless() && _configCache) {
    return _configCache
  }

  // Start with defaults
  let config = { ...DEFAULTS }

  // Load from storage
  const storedConfig = await configStore.get()
  if (storedConfig) {
    config = deepMerge(config, storedConfig as Partial<Config>)
  }

  // Apply env var overrides
  const envConfig = loadFromEnv(envVars)
  config = deepMerge(config, envConfig)

  // Validate
  config = ConfigSchema.parse(config)

  // Cache in server mode
  if (!isServerless()) {
    _configCache = config
  }

  return config
}

/**
 * Update configuration with a partial patch.
 * Persists to storage.
 */
export async function updateConfig(
  configStore: ConfigStore<Config>,
  patch: Partial<Config>,
): Promise<Config> {
  const storedConfig = (await configStore.get()) ?? DEFAULTS
  const updated = deepMerge(storedConfig, patch)
  const validated = ConfigSchema.parse(updated)

  // Save to storage
  await configStore.set(validated)

  // Update cache
  _configCache = validated

  return validated
}

/**
 * Reset configuration to defaults.
 * Deletes from storage.
 */
export async function resetConfig(configStore: ConfigStore<Config>): Promise<Config> {
  _configCache = null
  await configStore.delete()
  return DEFAULTS
}

/**
 * Clear the config cache. Useful for testing.
 */
export function clearConfigCache(): void {
  _configCache = null
}
