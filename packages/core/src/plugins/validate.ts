import { z } from 'zod'
import { getLogger } from '../logger'
import type { PluginConfig } from '../plugin-types'
import { getPluginSchema } from './schema-registry'

const basePluginSchema = z.object({ enabled: z.boolean() })

export interface PluginValidationResult {
  config: PluginConfig | null
  errors: string[]
}

/**
 * Validate a plugin's config against its registered schema.
 *
 * Shared by tools, agents, and channels — the logic is identical:
 * 1. If `enabled === false`, return null (disabled).
 * 2. If no raw config but schema exists, try defaults; skip if defaults fail.
 * 3. If raw config + schema, validate; disable on failure.
 * 4. Otherwise, return `{ enabled: true }` as the default.
 */
export function validatePluginConfig(
  pluginId: string,
  rawConfig: PluginConfig | undefined,
): PluginValidationResult {
  const log = getLogger()
  const schema = getPluginSchema(pluginId)

  if (rawConfig?.enabled === false) {
    log.debug(`Plugin ${pluginId} disabled by config`)
    return { config: null, errors: [] }
  }

  if (!rawConfig && schema) {
    const fallback = basePluginSchema.extend(schema.shape).safeParse({ enabled: true })
    if (!fallback.success) {
      log.debug(`Plugin ${pluginId} skipped (not configured)`)
      return { config: null, errors: [] }
    }
    return { config: fallback.data as PluginConfig, errors: [] }
  }

  if (rawConfig && schema) {
    const result = basePluginSchema.extend(schema.shape).safeParse(rawConfig)
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error(`Plugin ${pluginId} disabled (invalid config)`, { issues: errors })
      return { config: null, errors }
    }
  }

  return { config: rawConfig ?? { enabled: true }, errors: [] }
}
