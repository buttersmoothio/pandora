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
      default: ModelConfigSchema,
      fast: ModelConfigSchema.optional(),
      reasoning: ModelConfigSchema.optional(),
    })
    .default(() => ({
      default: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
    })),

  /** Memory settings */
  memory: z
    .object({
      enabled: z.boolean(),
      maxThreads: z.number().positive(),
      maxMessagesPerThread: z.number().positive(),
    })
    .default(() => ({
      enabled: true,
      maxThreads: 100,
      maxMessagesPerThread: 1000,
    })),

  /** Channel configurations */
  channels: z
    .object({
      telegram: z
        .object({
          enabled: z.boolean(),
          botToken: z.string().optional(),
          webhookSecret: z.string().optional(),
        })
        .default(() => ({ enabled: false })),
      discord: z
        .object({
          enabled: z.boolean(),
          botToken: z.string().optional(),
          applicationId: z.string().optional(),
        })
        .default(() => ({ enabled: false })),
      slack: z
        .object({
          enabled: z.boolean(),
          botToken: z.string().optional(),
          signingSecret: z.string().optional(),
        })
        .default(() => ({ enabled: false })),
      web: z.object({ enabled: z.boolean() }).default(() => ({ enabled: true })),
    })
    .default(() => ({
      telegram: { enabled: false },
      discord: { enabled: false },
      slack: { enabled: false },
      web: { enabled: true },
    })),

  /** Tool configurations */
  tools: z
    .object({
      enabled: z.array(z.string()),
      disabled: z.array(z.string()),
      mcp: z
        .object({
          servers: z.array(
            z.object({
              name: z.string(),
              url: z.string(),
            }),
          ),
        })
        .default(() => ({ servers: [] })),
    })
    .default(() => ({
      enabled: [],
      disabled: [],
      mcp: { servers: [] },
    })),

  /** Scheduled task configurations */
  schedule: z
    .object({
      tasks: z.array(
        z.object({
          id: z.string(),
          cron: z.string(),
          action: z.string(),
          enabled: z.boolean(),
        }),
      ),
    })
    .default(() => ({ tasks: [] })),

  /** Security settings */
  security: z
    .object({
      allowedOrigins: z.array(z.string()),
      rateLimiting: z
        .object({
          enabled: z.boolean(),
          requestsPerMinute: z.number().positive(),
        })
        .default(() => ({ enabled: false, requestsPerMinute: 60 })),
      apiKeys: z.object({ required: z.boolean() }).default(() => ({ required: false })),
    })
    .default(() => ({
      allowedOrigins: ['*'],
      rateLimiting: { enabled: false, requestsPerMinute: 60 },
      apiKeys: { required: false },
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

  // Default model
  if (envVars.MODEL_PROVIDER || envVars.MODEL_NAME) {
    partial.models = {
      default: {
        provider: envVars.MODEL_PROVIDER ?? 'anthropic',
        model: envVars.MODEL_NAME ?? 'claude-sonnet-4-20250514',
      },
    }
  }

  // Channels
  if (envVars.TELEGRAM_BOT_TOKEN) {
    partial.channels = {
      ...(partial.channels as object),
      telegram: {
        enabled: true,
        botToken: envVars.TELEGRAM_BOT_TOKEN,
        webhookSecret: envVars.TELEGRAM_WEBHOOK_SECRET,
      },
    }
  }

  if (envVars.DISCORD_BOT_TOKEN) {
    partial.channels = {
      ...(partial.channels as object),
      discord: {
        enabled: true,
        botToken: envVars.DISCORD_BOT_TOKEN,
        applicationId: envVars.DISCORD_APPLICATION_ID,
      },
    }
  }

  if (envVars.SLACK_BOT_TOKEN) {
    partial.channels = {
      ...(partial.channels as object),
      slack: {
        enabled: true,
        botToken: envVars.SLACK_BOT_TOKEN,
        signingSecret: envVars.SLACK_SIGNING_SECRET,
      },
    }
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
  configStore: ConfigStore,
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
    config = deepMerge(config, storedConfig)
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
  configStore: ConfigStore,
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
export async function resetConfig(configStore: ConfigStore): Promise<Config> {
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
