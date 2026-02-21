import type { Config } from '../config'
import { loadBuiltinTools } from './builtin'
import type { ToolRecord } from './types'

export { defineTool, getManifest, getManifests } from './define'
export type { CompartmentExecuteOptions, Endowments } from './sandbox'
export { executeInCompartment } from './sandbox'
export type {
  SandboxMode,
  ToolAnnotations,
  ToolManifest,
  ToolPermissions,
  ToolRecord,
} from './types'

/**
 * Load all tools, filtered by config.tools.enabled / config.tools.disabled.
 */
export async function loadTools(
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  return loadBuiltinTools(config, envVars)
}
