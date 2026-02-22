import type { Config } from '../config'
import { PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import type { ToolPlugin, ToolRecord } from './types'

export { defineTool, getAllManifests, getManifest, getManifests } from './define'
export type { CompartmentExecuteOptions, Endowments } from './sandbox'
export { executeInCompartment } from './sandbox'
export type {
  ConfigFieldDescriptor,
  SandboxMode,
  ToolAnnotations,
  ToolFactory,
  ToolManifest,
  ToolPackageFactory,
  ToolPackagePlugin,
  ToolPermissions,
  ToolPlugin,
  ToolRecord,
} from './types'

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const pluginRegistry = new Map<string, ToolPlugin>()

/**
 * Register a tool plugin.
 *
 * Must be called before tools are loaded. Importing the package
 * triggers its `defineTool` calls, so manifests are registered as
 * a side effect of importing the factory module.
 *
 * Validates schema version compatibility on registration.
 */
export function registerToolPlugin(plugin: ToolPlugin): void {
  if (plugin.schemaVersion !== PLUGIN_SCHEMA_VERSION) {
    throw new Error(
      `Tool plugin '${plugin.id}' uses schema v${plugin.schemaVersion}, ` +
        `but core expects v${PLUGIN_SCHEMA_VERSION}. Update the package.`,
    )
  }
  pluginRegistry.set(plugin.id, plugin)
}

/** @deprecated Use `registerToolPlugin` */
export const registerToolPackage = registerToolPlugin

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

  for (const [, plugin] of pluginRegistry) {
    const tools = plugin.factory(envVars)
    for (const [id, tool] of Object.entries(tools)) {
      if (config.tools[id]?.enabled) {
        result[id] = tool
      }
    }
  }

  return result
}

/** Get all registered tool plugins (regardless of load status) */
export function getAllRegisteredToolPlugins(): ToolPlugin[] {
  return [...pluginRegistry.values()]
}

/**
 * Clear the tool plugin registry. Useful for testing.
 */
export function clearToolPlugins(): void {
  pluginRegistry.clear()
}

/** @deprecated Use `clearToolPlugins` */
export const clearToolPackages = clearToolPlugins
