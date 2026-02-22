import { z } from 'zod'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { buildSchemaFromFields, PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import { clearManifestRegistry } from './define'
import { clearToolSchemaRegistry, getToolSchema, registerToolSchema } from './schema-registry'
import type { ToolPlugin, ToolPluginConfig, ToolRecord } from './types'

export type { DefineToolOptions, ToolDefinition } from './define'
export { defineTool, getAllManifests, getManifest, getManifests } from './define'
export type { CompartmentExecuteOptions, Endowments } from './sandbox'
export { executeInCompartment } from './sandbox'
export type {
  ConfigFieldDescriptor,
  PluginConfig,
  SandboxMode,
  ToolAnnotations,
  ToolExecuteContext,
  ToolFactory,
  ToolManifest,
  ToolPackageFactory,
  ToolPackagePlugin,
  ToolPermissions,
  ToolPlugin,
  ToolPluginConfig,
  ToolRecord,
} from './types'

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const basePluginSchema = z.object({ enabled: z.boolean() })
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
  if (plugin.configFields?.length) {
    registerToolSchema(plugin.id, buildSchemaFromFields(plugin.configFields))
  }
}

/** @deprecated Use `registerToolPlugin` */
export const registerToolPackage = registerToolPlugin

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/** Validate tool plugin config against the plugin's schema. Returns null if invalid. */
function validatePluginConfig(
  plugin: ToolPlugin,
  rawConfig: ToolPluginConfig | undefined,
): ToolPluginConfig | null {
  const log = getLogger()
  const schema = getToolSchema(plugin.id)

  if (rawConfig?.enabled === false) {
    log.debug(`Tool plugin ${plugin.id} disabled by config`)
    return null
  }

  if (!rawConfig && schema) {
    log.debug(`Tool plugin ${plugin.id} skipped (not configured)`)
    return null
  }

  if (rawConfig && schema) {
    const result = basePluginSchema.extend(schema.shape).safeParse(rawConfig)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error(`Tool plugin ${plugin.id} disabled (invalid config)`, { issues })
      return null
    }
  }

  return rawConfig ?? { enabled: true }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load all tools from registered packages, filtered by config.
 *
 * Plugin-level config (`config.toolPlugins[pluginId]`) controls whether
 * a plugin is active and provides user settings to the factory.
 * Tool-level config (`config.tools[toolId].enabled`) controls individual tools.
 */
export async function loadTools(
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  const result: ToolRecord = {}

  for (const [, plugin] of pluginRegistry) {
    const pluginConfig = validatePluginConfig(plugin, config.toolPlugins[plugin.id])
    if (!pluginConfig) continue

    const tools = plugin.factory(envVars, pluginConfig)
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
  clearToolSchemaRegistry()
  clearManifestRegistry()
}

/** @deprecated Use `clearToolPlugins` */
export const clearToolPackages = clearToolPlugins
