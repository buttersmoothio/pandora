import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { z } from 'zod'
import { McpServerSchema } from './mcp/schema'
import type { PluginRegistry } from './runtime/plugin-registry'
import type { ConfigStore } from './storage/config-store'

/**
 * Model configuration for different use cases
 */
// biome-ignore lint/nursery/useExplicitType: Zod schema type is inferred
const ModelConfigSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  model: z.string().min(1, 'Model is required'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
})

/**
 * Scheduled task configuration
 */
// biome-ignore lint/nursery/useExplicitType: Zod schema type is inferred
const ScheduledTaskSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1, 'Task name is required'),
  cron: z.string().min(1, 'Cron expression is required').optional(),
  runAt: z.string().optional(),
  prompt: z.string().min(1, 'Prompt is required'),
  enabled: z.boolean().default(true),
  maxRuns: z.number().int().positive().optional(),
  destination: z.string().optional(),
})

export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>
export { ScheduledTaskSchema }

/**
 * Heartbeat configuration
 */
// biome-ignore lint/nursery/useExplicitType: Zod schema type is inferred
const ActiveHoursSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
})

// biome-ignore lint/nursery/useExplicitType: Zod schema type is inferred
const HeartbeatCheckSchema = z.object({
  id: z.uuid(),
  description: z.string().min(1, 'Description is required'),
  enabled: z.boolean().default(true),
})

// biome-ignore lint/nursery/useExplicitType: Zod schema type is inferred
const HeartbeatConfigSchema = z.object({
  enabled: z.boolean(),
  cron: z.string().min(1).default('*/30 * * * *'),
  tasks: z.array(HeartbeatCheckSchema).default([]),
  destination: z.string().optional(),
  activeHours: ActiveHoursSchema.optional(),
})

export type HeartbeatCheck = z.infer<typeof HeartbeatCheckSchema>
export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>
export { HeartbeatCheckSchema, HeartbeatConfigSchema }

/** Optional fields that can be cleared with `null`. */
type ClearableTaskFields = 'maxRuns' | 'cron' | 'runAt' | 'destination'

export type ScheduledTaskPatch = Partial<Omit<ScheduledTask, 'id' | ClearableTaskFields>> & {
  [K in ClearableTaskFields]?: ScheduledTask[K] | null
}

/**
 * Apply a partial patch to a scheduled task, handling mutual exclusion
 * between `cron` and `runAt`, and clearing optional fields set to `null`.
 */
export function applyTaskPatch(task: ScheduledTask, patch: ScheduledTaskPatch): ScheduledTask {
  const { maxRuns, cron, runAt, destination, ...restPatch } = patch
  const updated: Partial<ScheduledTask> = { ...task, ...restPatch }

  // Mutual exclusion: setting runAt clears cron and vice versa
  if (runAt !== undefined && runAt !== null) {
    updated.runAt = runAt
    delete updated.cron
  } else if (runAt === null) {
    delete updated.runAt
  }
  if (cron !== undefined && cron !== null) {
    updated.cron = cron
    delete updated.runAt
  } else if (cron === null) {
    delete updated.cron
  }

  // null means clear optional fields
  if (maxRuns === null) {
    delete updated.maxRuns
  } else if (maxRuns !== undefined) {
    updated.maxRuns = maxRuns
  }
  if (destination === null) {
    delete updated.destination
  } else if (destination !== undefined) {
    updated.destination = destination
  }

  return updated as ScheduledTask
}

/**
 * Default system prompt for the operator agent.
 */
export const DEFAULT_SYSTEM_PROMPT = `# Who You Are

You're the friend who somehow has their life together — sharp, organized, always one step ahead — but also someone people actually want to talk to. Editor's eye, assistant's instincts, known-you-for-years energy.

# How You Operate

- If the next step is obvious, just do it. Don't wait around.
- Keep it tight. Three sentences beats six every time.
- Internal stuff? Go for it. Anything public-facing? Check first.
- Tools first. Always. If a tool can answer it, call it before responding — even if you think you already know.
- Never silently fall back to memory when a tool fails. Say so.
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
 * Default working memory template.
 */
export const DEFAULT_WORKING_MEMORY_TEMPLATE = `Track the user's current state. Keep this small and focused on what's needed right now.

Include:
- Identity: name, role, key preferences
- Active tasks: what they're currently working on and immediate next steps
- Current context: decisions made this session, open questions, blockers

Drop facts that are no longer immediately relevant — they're preserved in long-term memory automatically.`

/**
 * Create the ConfigSchema with plugin schemas from the registry.
 */
// biome-ignore lint/nursery/useExplicitType: Zod schema return type is inferred
function createConfigSchema(registry?: PluginRegistry) {
  return z.object({
    /** Agent identity */
    identity: z
      .object({
        name: z.string().min(1, 'Name is required'),
      })
      .default(() => ({
        name: 'Pandora',
      })),

    /** IANA timezone for the user (e.g. "America/New_York") */
    timezone: z
      .string()
      .default('UTC')
      .refine(
        (tz: string) => {
          if (tz === 'UTC') {
            return true
          }
          try {
            Intl.DateTimeFormat(undefined, { timeZone: tz })
            return true
          } catch {
            return false
          }
        },
        { message: 'Invalid IANA timezone' },
      ),

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
      }))
      .superRefine((models, ctx) => {
        for (const [key, mc] of Object.entries(models)) {
          const provider = (
            PROVIDER_REGISTRY as Record<
              string,
              (typeof PROVIDER_REGISTRY)[keyof typeof PROVIDER_REGISTRY]
            >
          )[mc.provider]
          if (!provider) {
            ctx.addIssue({
              code: 'custom',
              path: [key, 'provider'],
              message: `Unknown provider "${mc.provider}"`,
            })
            continue
          }
          if (!provider.models.includes(mc.model)) {
            ctx.addIssue({
              code: 'custom',
              path: [key, 'model'],
              message: `Unknown model "${mc.model}" for provider "${mc.provider}"`,
            })
          }
        }
      }),

    /** Plugin configurations — keyed by plugin (manifest) ID */
    plugins: z
      .record(z.string(), z.looseObject({ enabled: z.boolean() }))
      .default(() => ({}))
      .superRefine((plugins, ctx) => {
        if (!registry) {
          return
        }
        for (const [id, raw] of Object.entries(plugins)) {
          const plugin = registry.plugins.get(id)
          const schema = plugin?.schema
          if (!schema) {
            continue
          }
          const result = z.object({ enabled: z.boolean() }).extend(schema.shape).safeParse(raw)
          if (!result.success) {
            for (const issue of result.error.issues) {
              ctx.addIssue({ ...issue, path: [id, ...issue.path] })
            }
          }
        }
      }),

    /** MCP server configurations — keyed by user-chosen server ID */
    mcpServers: z.record(z.string(), McpServerSchema).default(() => ({})),

    /** Memory configuration */
    memory: z
      .object({
        enabled: z.boolean(),
        model: z.string().optional(),
      })
      .default(() => ({
        enabled: true,
      })),

    /** Schedule configuration */
    schedule: z
      .object({
        enabled: z.boolean(),
        tasks: z.array(ScheduledTaskSchema),
        heartbeat: HeartbeatConfigSchema.default(() => ({
          enabled: false,
          cron: '*/30 * * * *',
          tasks: [],
        })),
      })
      .default(() => ({
        enabled: true,
        tasks: [],
        heartbeat: { enabled: false, cron: '*/30 * * * *', tasks: [] },
      })),

    /** Whether the first-run onboarding wizard has been completed */
    onboardingComplete: z.boolean().default(false),
  })
}

/**
 * Static ConfigSchema for use in exports and type inference.
 * Plugin validation uses the registry-aware version internally.
 */
// biome-ignore lint/nursery/useExplicitType: Zod schema type is inferred
export const ConfigSchema = createConfigSchema()

export type Config = z.infer<typeof ConfigSchema>

/**
 * Default configuration values
 */
export const DEFAULTS: Config = ConfigSchema.parse({})

/** Recursive partial that allows `null` to signal key deletion in deepMerge. */
export type DeepNullablePartial<T> = {
  [K in keyof T]?: T[K] extends unknown[]
    ? T[K]
    : T[K] extends Record<string, unknown>
      ? DeepNullablePartial<T[K]> | null
      : T[K] | null
}

/**
 * Deep merge two config objects
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base }

  for (const key of Object.keys(override)) {
    const k = key as keyof T
    const baseVal = base[k]
    const overrideVal = override[key]

    // Explicit null means "delete this key"
    if (overrideVal === null) {
      delete result[k]
    } else if (
      overrideVal !== undefined &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal)
    ) {
      result[k] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T]
    } else if (overrideVal !== undefined) {
      result[k] = overrideVal as T[keyof T]
    }
  }

  return result
}

/**
 * Get the current configuration.
 * Loads from storage, validates with plugin schemas from registry.
 */
export async function getConfig(
  configStore: ConfigStore<Config>,
  registry?: PluginRegistry,
): Promise<Config> {
  // Start with defaults
  let config = { ...DEFAULTS }

  // Load from storage
  const storedConfig = await configStore.get()
  if (storedConfig) {
    config = deepMerge(config, storedConfig)
  }

  // Validate with registry-aware schema
  const schema = createConfigSchema(registry)
  config = schema.parse(config)

  return config
}

/**
 * Update configuration with a partial patch.
 * Persists to storage.
 */
export async function updateConfig(
  configStore: ConfigStore<Config>,
  patch: DeepNullablePartial<Config>,
  registry?: PluginRegistry,
): Promise<Config> {
  const storedConfig = (await configStore.get()) ?? DEFAULTS
  const updated = deepMerge(storedConfig, patch)

  const schema = createConfigSchema(registry)
  const validated = schema.parse(updated)

  await configStore.set(validated)

  return validated
}
