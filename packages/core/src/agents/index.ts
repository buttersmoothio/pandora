import { Agent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import type { Config } from '../config'
import { buildModelString } from '../mastra/models'
import { type Alert, buildSchemaFromFields, PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import { registerPluginSchema, removePluginSchema } from '../plugins/schema-registry'
import { validatePluginConfig } from '../plugins/validate'
import type { ToolRecord } from '../tools'
import type { AgentDefinition } from './define'
import { clearAgentManifestRegistry, getAgentManifest } from './define'
import type { ModelToolKey } from './model-tools'
import { resolveModelTools } from './model-tools'
import type { AgentPlugin, AgentPluginConfig, AgentRecord } from './types'

export type { AgentDefinition } from './define'
export { getAgentManifest, getAllAgentManifests, registerAgentManifest } from './define'
export type {
  AgentManifest,
  AgentPlugin,
  AgentPluginConfig,
  AgentRecord,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  PluginConfig,
} from './types'

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const pluginRegistry = new Map<string, AgentPlugin>()
const pluginAgentsMap = new Map<string, string[]>()
const agentAlertsMap = new Map<string, Alert[]>()

/**
 * Register an agent plugin.
 *
 * Must be called before agents are loaded. Agent manifests are registered
 * by the manifest adapter when processing agent entries.
 *
 * Validates schema version compatibility on registration.
 */
export function registerAgentPlugin(plugin: AgentPlugin): void {
  if (plugin.schemaVersion !== PLUGIN_SCHEMA_VERSION) {
    throw new Error(
      `Agent plugin '${plugin.id}' uses schema v${plugin.schemaVersion}, ` +
        `but core expects v${PLUGIN_SCHEMA_VERSION}. Update the package.`,
    )
  }
  pluginRegistry.set(plugin.id, plugin)
  pluginAgentsMap.set(
    plugin.id,
    plugin.agents.map((a) => a.id),
  )

  if (plugin.configFields?.length) {
    registerPluginSchema(plugin.id, buildSchemaFromFields(plugin.configFields))
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Extract per-agent config from the unified plugin config. */
function getAgentConfig(
  pluginConfig: AgentPluginConfig | null,
  agentId: string,
):
  | { model?: { provider: string; model: string }; tools?: Record<string, { enabled: boolean }> }
  | undefined {
  if (!pluginConfig) return undefined
  const agents = pluginConfig.agents as Record<string, unknown> | undefined
  return agents?.[agentId] as ReturnType<typeof getAgentConfig>
}

/** Create an Agent from a manifest and resolved config. */
function createAgentFromManifest(
  agentDef: AgentDefinition,
  config: Config,
  pluginConfig: AgentPluginConfig | null,
  tools: ToolRecord,
  memory: MastraMemory,
): Agent | null {
  const manifest = getAgentManifest(agentDef.id)
  if (!manifest) return null

  const agentConfig = getAgentConfig(pluginConfig, agentDef.id)
  const modelConfig = agentConfig?.model ?? config.models.operator
  return new Agent({
    id: manifest.id,
    name: manifest.name,
    instructions: manifest.instructions,
    description: manifest.description,
    model: buildModelString(modelConfig),
    tools,
    memory,
  })
}

/** Resolve global tool dependencies from manifest useTools. */
function resolveInheritedTools(agentDef: AgentDefinition, globalTools: ToolRecord): ToolRecord {
  const tools: ToolRecord = {}
  for (const id of agentDef.useTools ?? []) {
    if (globalTools[id]) tools[id] = globalTools[id]
  }
  return tools
}

/** Resolve model-native tools from manifest modelTools. */
async function resolveAgentModelTools(
  agentDef: AgentDefinition,
  config: Config,
  pluginConfig: AgentPluginConfig | null,
): Promise<{ tools: ToolRecord; alerts: Alert[] }> {
  if (!agentDef.modelTools?.length || config.nativeModelTools === false) {
    return { tools: {}, alerts: [] }
  }
  const agentCfg = getAgentConfig(pluginConfig, agentDef.id)
  const modelConfig = agentCfg?.model ?? config.models.operator
  return resolveModelTools(buildModelString(modelConfig), agentDef.modelTools as ModelToolKey[])
}

/**
 * Load all agents from registered plugins, filtered by config.
 *
 * Plugin-level config (`config.plugins[pluginId]`) controls whether
 * a plugin is active and provides user settings to the factory.
 * Per-agent config (model overrides, tool toggles) nests under `config.plugins[pluginId].agents`.
 *
 * @param globalTools - The tool record loaded by `loadTools()`, used for `useTools` resolution.
 */
export async function loadAgents(
  config: Config,
  memory: MastraMemory,
  globalTools: ToolRecord = {},
): Promise<AgentRecord> {
  const result: AgentRecord = {}
  agentAlertsMap.clear()

  for (const [, plugin] of pluginRegistry) {
    const { config: pluginConfig } = validatePluginConfig(plugin.id, config.plugins[plugin.id])
    if (!pluginConfig) continue

    for (const agentDef of plugin.agents) {
      const inheritedTools = resolveInheritedTools(agentDef, globalTools)
      const { tools: modelNativeTools, alerts } = await resolveAgentModelTools(
        agentDef,
        config,
        pluginConfig,
      )
      if (alerts.length) agentAlertsMap.set(agentDef.id, alerts)

      const allTools = { ...inheritedTools, ...modelNativeTools }
      const agent = createAgentFromManifest(agentDef, config, pluginConfig, allTools, memory)
      if (agent) result[agentDef.id] = agent
    }
  }

  return result
}

/** Get all registered agent plugins (regardless of load status) */
export function getAllRegisteredAgentPlugins(): AgentPlugin[] {
  return [...pluginRegistry.values()]
}

/** Get the agent IDs that a plugin provides, discovered at registration time. */
export function getPluginAgentIds(pluginId: string): string[] {
  return pluginAgentsMap.get(pluginId) ?? []
}

/** Get useTools IDs for an agent by ID. */
export function getAgentUseToolIds(agentId: string): string[] {
  for (const plugin of pluginRegistry.values()) {
    const agentDef = plugin.agents.find((a) => a.id === agentId)
    if (agentDef) return agentDef.useTools ?? []
  }
  return []
}

/** Get alerts for a specific agent (populated after `loadAgents()`). */
export function getAgentAlerts(agentId: string): Alert[] {
  return agentAlertsMap.get(agentId) ?? []
}

/** Validate all registered plugins and return errors keyed by plugin ID. */
export function getAgentPluginValidationErrors(config: Config): Record<string, string[]> {
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
 * Clear the agent plugin registry. Useful for testing.
 */
export function clearAgentPlugins(): void {
  for (const id of pluginRegistry.keys()) removePluginSchema(id)
  pluginRegistry.clear()
  pluginAgentsMap.clear()
  agentAlertsMap.clear()
  clearAgentManifestRegistry()
}
