import { Agent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import { z } from 'zod'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { buildModelString } from '../mastra/models'
import { buildSchemaFromFields, PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import type { ToolRecord } from '../tools'
import { removeManifest, type ToolManifest } from '../tools'
import type { AgentDefinition } from './define'
import { clearAgentManifestRegistry, getAgentManifest } from './define'
import { clearAgentSchemaRegistry, getAgentSchema, registerAgentSchema } from './schema-registry'
import type { AgentPlugin, AgentPluginConfig, AgentRecord } from './types'

export type { AgentDefinition, DefineAgentOptions, GetToolsContext } from './define'
export { defineAgent, getAgentManifest, getAllAgentManifests } from './define'
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

const basePluginSchema = z.object({ enabled: z.boolean() })
const pluginRegistry = new Map<string, AgentPlugin>()
const pluginAgentsMap = new Map<string, string[]>()

/**
 * Register an agent plugin.
 *
 * Must be called before agents are loaded. Importing the package
 * triggers its `defineAgent` calls, so manifests are registered as
 * a side effect of importing the definition module.
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

  // Remove scoped tool manifests from the global tool registry.
  // Scoped tools are agent-namespaced and should not appear in /api/tools.
  const seen = new Set<string>()
  for (const agentDef of plugin.agents) {
    for (const toolDef of agentDef.tools) {
      if (!seen.has(toolDef.id)) {
        seen.add(toolDef.id)
        removeManifest(toolDef.id)
      }
    }
  }

  if (plugin.configFields?.length) {
    registerAgentSchema(plugin.id, buildSchemaFromFields(plugin.configFields))
  }
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/** Result of validating an agent plugin's config. */
export interface AgentPluginValidationResult {
  config: AgentPluginConfig | null
  errors: string[]
}

/** Validate agent plugin config against the plugin's schema. */
function validatePluginConfig(
  plugin: AgentPlugin,
  rawConfig: AgentPluginConfig | undefined,
): AgentPluginValidationResult {
  const log = getLogger()
  const schema = getAgentSchema(plugin.id)

  if (rawConfig?.enabled === false) {
    log.debug(`Agent plugin ${plugin.id} disabled by config`)
    return { config: null, errors: [] }
  }

  if (!rawConfig && schema) {
    log.debug(`Agent plugin ${plugin.id} skipped (not configured)`)
    return { config: null, errors: [] }
  }

  if (rawConfig && schema) {
    const result = basePluginSchema.extend(schema.shape).safeParse(rawConfig)
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error(`Agent plugin ${plugin.id} disabled (invalid config)`, { issues: errors })
      return { config: null, errors }
    }
  }

  return { config: rawConfig ?? { enabled: true }, errors: [] }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Load scoped tools from an agent's tool definitions, filtered by config. */
function loadScopedTools(
  agentDef: AgentDefinition,
  config: Config,
  envVars: Record<string, string | undefined>,
  pluginConfig: AgentPluginConfig,
): ToolRecord {
  const tools: ToolRecord = {}
  const agentConfig = config.agents[agentDef.id]
  for (const toolDef of agentDef.tools) {
    if (agentConfig?.tools?.[toolDef.id]?.enabled === false) continue
    tools[toolDef.id] = toolDef(envVars, pluginConfig)
  }
  return tools
}

/** Create an Agent from a manifest and resolved config. */
function createAgentFromManifest(
  agentDef: AgentDefinition,
  config: Config,
  tools: ToolRecord,
  memory: MastraMemory,
): Agent | null {
  const agentConfig = config.agents[agentDef.id]
  if (agentConfig?.enabled === false) return null

  const manifest = getAgentManifest(agentDef.id)
  if (!manifest) return null

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

/** Resolve dynamic tools from an agent's getTools hook. Returns null if the agent opts out. */
async function resolveDynamicTools(
  agentDef: AgentDefinition,
  config: Config,
  envVars: Record<string, string | undefined>,
  pluginConfig: AgentPluginConfig,
): Promise<ToolRecord | null> {
  if (!agentDef.getTools) return {}
  const agentConfig = config.agents[agentDef.id]
  const modelConfig = agentConfig?.model ?? config.models.operator
  return agentDef.getTools({
    model: buildModelString(modelConfig),
    pluginConfig,
    env: envVars,
  })
}

/**
 * Load all agents from registered plugins, filtered by config.
 *
 * Plugin-level config (`config.agentPlugins[pluginId]`) controls whether
 * a plugin is active and provides user settings to the factory.
 * Agent-level config (`config.agents[agentId]`) controls individual agents.
 */
export async function loadAgents(
  config: Config,
  envVars: Record<string, string | undefined>,
  memory: MastraMemory,
): Promise<AgentRecord> {
  const result: AgentRecord = {}

  for (const [, plugin] of pluginRegistry) {
    const { config: pluginConfig } = validatePluginConfig(plugin, config.agentPlugins[plugin.id])
    if (!pluginConfig) continue

    for (const agentDef of plugin.agents) {
      const dynamicTools = await resolveDynamicTools(agentDef, config, envVars, pluginConfig)
      if (dynamicTools === null) continue // Agent opted out of loading

      const scopedTools = loadScopedTools(agentDef, config, envVars, pluginConfig)
      const allTools = { ...scopedTools, ...dynamicTools }
      const agent = createAgentFromManifest(agentDef, config, allTools, memory)
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

/** Get scoped tool manifests for an agent by ID. */
export function getScopedToolManifests(agentId: string): ToolManifest[] {
  for (const plugin of pluginRegistry.values()) {
    const agentDef = plugin.agents.find((a) => a.id === agentId)
    if (agentDef) return agentDef.tools.map((t) => t.manifest)
  }
  return []
}

/** Validate all registered plugins and return errors keyed by plugin ID. */
export function getAgentPluginValidationErrors(config: Config): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [, plugin] of pluginRegistry) {
    const { errors } = validatePluginConfig(plugin, config.agentPlugins[plugin.id])
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
  pluginRegistry.clear()
  pluginAgentsMap.clear()
  clearAgentSchemaRegistry()
  clearAgentManifestRegistry()
}
