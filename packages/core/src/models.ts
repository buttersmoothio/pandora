import type { Config } from './config'

/**
 * Convert a model config object to Mastra's 'provider/model' string format.
 */
export function buildModelString(mc: { provider: string; model: string }): string {
  return `${mc.provider}/${mc.model}`
}

/**
 * Resolve a model string from config by agent name.
 */
export function resolveModel(config: Config, agent: keyof Config['models']): string {
  return buildModelString(config.models[agent])
}
