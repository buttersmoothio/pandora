import type { Config } from '../config'

/**
 * Convert a model config object to Mastra's 'provider/model' string format.
 */
export function buildModelString(mc: { provider: string; model: string }): string {
  return `${mc.provider}/${mc.model}`
}

/**
 * Resolve a model string from config by key.
 * Falls back to 'default' if the requested key is not configured.
 */
export function resolveModel(
  config: Config,
  key: 'default' | 'fast' | 'reasoning' = 'default',
): string {
  const mc = config.models[key] ?? config.models.default
  return buildModelString(mc)
}
