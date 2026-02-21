import type { Config } from '../config'
import type { ToolPackagePlugin, ToolRecord } from './types'

export { defineTool, getAllManifests, getManifest, getManifests } from './define'
export type { CompartmentExecuteOptions, Endowments } from './sandbox'
export { executeInCompartment } from './sandbox'
export type {
  SandboxMode,
  ToolAnnotations,
  ToolManifest,
  ToolPackageFactory,
  ToolPackagePlugin,
  ToolPermissions,
  ToolRecord,
} from './types'

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const TOOL_SCHEMA_VERSION = 1
const packageRegistry = new Map<string, ToolPackagePlugin>()

/**
 * Register a tool package plugin.
 *
 * Must be called before tools are loaded. Importing the package
 * triggers its `defineTool` calls, so manifests are registered as
 * a side effect of importing the factory module.
 *
 * Validates schema version compatibility on registration.
 */
export function registerToolPackage(plugin: ToolPackagePlugin): void {
  if (plugin.schemaVersion !== TOOL_SCHEMA_VERSION) {
    throw new Error(
      `Tool plugin '${plugin.id}' uses schema v${plugin.schemaVersion}, ` +
        `but core expects v${TOOL_SCHEMA_VERSION}. Update the package.`,
    )
  }
  packageRegistry.set(plugin.id, plugin)
}

/**
 * Load all tools from registered packages, filtered by config.
 *
 * Only tools explicitly enabled in config (`config.tools[id].enabled === true`)
 * are included. The default config determines which tools are on.
 */
export async function loadTools(
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  const result: ToolRecord = {}

  for (const [, plugin] of packageRegistry) {
    const tools = plugin.factory(envVars)
    for (const [id, tool] of Object.entries(tools)) {
      if (config.tools[id]?.enabled) {
        result[id] = tool
      }
    }
  }

  return result
}

/**
 * Clear the tool package registry. Useful for testing.
 */
export function clearToolPackages(): void {
  packageRegistry.clear()
}
