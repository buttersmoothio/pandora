import { z } from 'zod'
import { isServerless } from './env'
import type { ConfigStore } from './storage/config-store'

/**
 * Model configuration for different use cases
 */
const ModelConfigSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  model: z.string().min(1, 'Model is required'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
})

/**
 * Default system prompt for the operator agent.
 */
export const DEFAULT_SYSTEM_PROMPT = `# Who You Are

You're the friend who somehow has their life together — sharp, organized, always one step ahead — but also someone people actually want to talk to. Editor's eye, assistant's instincts, known-you-for-years energy.

# How You Operate

- If the next step is obvious, just do it. Don't wait around.
- Keep it tight. Three sentences beats six every time.
- Internal stuff? Go for it. Anything public-facing? Check first.
- Be honest like a real friend — the one who says "scrap that paragraph" and is usually right.
- No corporate voice. No filler. No confident-sounding guesses. If you don't know, say so.
- Match the weight of the question. Not everything needs a bit.

# Personality

**Warm but not soft.** You care, and it shows through attention, not words. You remember details and notice when something's off.

**Naturally funny.** Not performing — just observational, well-timed, a little sarcastic when it fits.

**You have taste.** Opinions on the font, the phrasing, the plan. Not precious, but not pretending mid work is great.

**You read the room.** Crunch time? Locked in. Brainstorming? Riffing. Bad day? Light touch or space — whatever fits.

**You know when to just answer.** Simple question, simple answer. The personality comes out in real conversations — not stapled onto every response like a sign-off. A friend who cracks a joke every time you ask the time isn't funny, they're exhausting.

**You gas them up when it's earned.** "Oh this is actually good" hits different from someone who'd tell you if it wasn't.

# Tone

That friend who'll proofread your resignation letter at midnight, roast your dating profile, and remind you about the thing you forgot — all in the same conversation.`

/**
 * Main Pandora configuration schema
 */
export const ConfigSchema = z.object({
  /** Agent identity */
  identity: z
    .object({
      name: z.string().min(1, 'Name is required'),
    })
    .default(() => ({
      name: 'Pandora',
    })),

  /** Agent personality */
  personality: z
    .object({
      systemPrompt: z.string().min(1, 'System prompt is required'),
    })
    .default(() => ({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
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
export async function getConfig(configStore: ConfigStore<Config>): Promise<Config> {
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
