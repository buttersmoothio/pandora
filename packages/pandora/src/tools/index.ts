import type { Config } from '../config'
import { loadBuiltinTools } from './builtin'
import type { ToolRecord } from './types'

export type { ToolRecord } from './types'

/**
 * Load all tools from all tiers.
 *
 * Currently only Tier 1 (built-in) tools are implemented.
 * Tier 2 (generated/DB-stored) and Tier 3 (MCP) are deferred.
 */
export async function loadTools(
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  // Tier 1: Built-in tools
  const builtin = loadBuiltinTools(config, envVars)

  // Tier 2: Generated tools (deferred)
  // const generated = await loadGeneratedTools(config, storage)

  // Tier 3: MCP tools (deferred)
  // const mcp = await loadMcpTools(config)

  return { ...builtin }
}
