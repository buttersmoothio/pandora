import type { Config } from '../config'
import { type Alert, buildSchemaFromFields, PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import { registerPluginSchema, removePluginSchema } from '../plugins/schema-registry'
import { validatePluginConfig } from '../plugins/validate'
import { bindToolExport, buildManifest, clearManifestRegistry, registerManifest } from './define'
import type { ToolPlugin, ToolPluginConfig, ToolRecord } from './types'

export {
  getAllManifests,
  getManifest,
  getManifests,
  registerManifest,
  removeManifest,
} from './define'
export type { CompartmentExecuteOptions, Endowments } from './sandbox'
export { executeInCompartment } from './sandbox'
export type {
  Alert,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  PluginConfig,
  ResolveToolsContext,
  ResolveToolsResult,
  SandboxMode,
  ToolAnnotations,
  ToolExport,
  ToolManifest,
  ToolPermissions,
  ToolPlugin,
  ToolPluginConfig,
  ToolRecord,
} from './types'
export { DEFAULT_TOOL_TIMEOUT } from './types'

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const pluginRegistry = new Map<string, ToolPlugin>()
const pluginToolsMap = new Map<string, string[]>()
const pluginAlertsMap = new Map<string, Alert[]>()

/**
 * Register a tool plugin.
 *
 * Registers tool manifests immediately so they appear in `/api/tools`.
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

  for (const entry of plugin.tools) {
    registerManifest(buildManifest(entry))
  }

  pluginToolsMap.set(
    plugin.id,
    plugin.tools.map((t) => t.id),
  )

  if (plugin.configFields?.length) {
    registerPluginSchema(plugin.id, buildSchemaFromFields(plugin.configFields))
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Load static tools from a plugin's ToolExport entries. */
function loadStaticTools(
  plugin: ToolPlugin,
  envVars: Record<string, string | undefined>,
  pluginConfig: ToolPluginConfig,
): ToolRecord {
  const tools: ToolRecord = {}
  for (const exp of plugin.tools) {
    const tool = bindToolExport(exp, envVars, pluginConfig)
    if (pluginConfig.requireApproval) {
      tool.requireApproval = true
    }
    tools[exp.id] = tool
  }
  return tools
}

/**
 * Load all tools from registered packages, filtered by config.
 *
 * Plugin-level config (`config.plugins[pluginId]`) controls whether
 * a plugin is active and provides user settings to the factory.
 */
export async function loadTools(
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  const result: ToolRecord = {}
  pluginAlertsMap.clear()

  for (const [, plugin] of pluginRegistry) {
    const { config: pluginConfig } = validatePluginConfig(plugin.id, config.plugins[plugin.id])
    if (!pluginConfig) continue

    Object.assign(result, loadStaticTools(plugin, envVars, pluginConfig))

    // Dynamic tools from resolveTools hook — returns ToolExport objects
    // that go through bindToolExport() + registerManifest()
    if (plugin.resolveTools) {
      const { tools: resolved, alerts } = await plugin.resolveTools({
        pluginConfig,
        env: envVars,
      })
      for (const exp of resolved) {
        registerManifest(buildManifest(exp))
        result[exp.id] = bindToolExport(exp, envVars, pluginConfig)
      }
      if (alerts?.length) pluginAlertsMap.set(plugin.id, alerts)
    }
  }

  return result
}

/** Get all registered tool plugins (regardless of load status) */
export function getAllRegisteredToolPlugins(): ToolPlugin[] {
  return [...pluginRegistry.values()]
}

/** Get the tool IDs that a plugin provides, discovered at registration time. */
export function getPluginToolIds(pluginId: string): string[] {
  return pluginToolsMap.get(pluginId) ?? []
}

/** Get alerts for a specific plugin (populated after `loadTools()`). */
export function getPluginAlerts(pluginId: string): Alert[] {
  return pluginAlertsMap.get(pluginId) ?? []
}

/** Validate all registered plugins and return errors keyed by plugin ID. */
export function getPluginValidationErrors(config: Config): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [, plugin] of pluginRegistry) {
    const { errors } = validatePluginConfig(plugin.id, config.plugins[plugin.id])
    if (errors.length > 0) {
      result[plugin.id] = errors
    }
  }
  return result
}

/**
 * Clear the tool plugin registry. Useful for testing.
 */
export function clearToolPlugins(): void {
  for (const id of pluginRegistry.keys()) removePluginSchema(id)
  pluginRegistry.clear()
  pluginToolsMap.clear()
  pluginAlertsMap.clear()
  clearManifestRegistry()
}
