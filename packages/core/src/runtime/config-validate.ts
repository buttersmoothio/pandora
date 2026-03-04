import type { PluginConfig } from '@pandorakit/sdk'
import { z } from 'zod'
import { getLogger } from '../logger'
import type { RegisteredPlugin } from './plugin-registry'

const basePluginSchema = z.object({ enabled: z.boolean() })

export interface PluginValidationResult {
  config: PluginConfig | null
  errors: string[]
}

/**
 * Validate a plugin's config against its schema.
 *
 * Takes the schema from the RegisteredPlugin directly instead of
 * looking it up in a global registry.
 */
export function validatePluginConfig(
  plugin: RegisteredPlugin,
  rawConfig: PluginConfig | undefined,
): PluginValidationResult {
  const log = getLogger()
  const schema = plugin.schema

  if (!rawConfig) {
    log.debug(`Plugin ${plugin.id} skipped (not configured)`)
    return { config: null, errors: [] }
  }

  if (rawConfig.enabled === false) {
    log.debug(`Plugin ${plugin.id} disabled by config`)
    return { config: null, errors: [] }
  }

  if (schema) {
    const result = basePluginSchema.extend(schema.shape).safeParse(rawConfig)
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error(`Plugin ${plugin.id} disabled (invalid config)`, { issues: errors })
      return { config: null, errors }
    }
  }

  return { config: rawConfig, errors: [] }
}
