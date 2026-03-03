import { Agent as MastraAgent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import type { Alert, PluginConfig } from '@pandorakit/sdk'
import type { Agent } from '@pandorakit/sdk/agents'
import { filterModelToolKeys, resolveModelTools } from '../agents/model-tools'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { buildModelString } from '../models'
import type { ToolRecord } from '../tools/types'
import { validatePluginConfig } from './config-validate'
import { namespacedKey, validateEntityId } from './namespace'
import type { PluginRegistry } from './plugin-registry'

type AgentRecord = Record<string, MastraAgent>

function getAgentConfig(pluginConfig: PluginConfig | null, agentId: string) {
  if (!pluginConfig) return undefined
  return pluginConfig.agents?.[agentId]
}

function resolveInheritedTools(agentDef: Agent, globalTools: ToolRecord): ToolRecord {
  const tools: ToolRecord = {}
  for (const id of agentDef.useTools ?? []) {
    if (globalTools[id]) tools[id] = globalTools[id]
  }
  return tools
}

async function resolveAgentModelTools(
  agentDef: Agent,
  config: Config,
  pluginConfig: PluginConfig | null,
): Promise<{ tools: ToolRecord; alerts: Alert[] }> {
  if (!agentDef.modelTools?.length) {
    return { tools: {}, alerts: [] }
  }
  const agentCfg = getAgentConfig(pluginConfig, agentDef.id)
  const modelConfig = agentCfg?.model ?? config.models.operator
  return resolveModelTools(buildModelString(modelConfig), filterModelToolKeys(agentDef.modelTools))
}

export async function loadAgents(
  registry: PluginRegistry,
  config: Config,
  memory: MastraMemory,
  envVars: Record<string, string | undefined>,
  globalTools: ToolRecord = {},
): Promise<AgentRecord> {
  const log = getLogger()
  const result: AgentRecord = {}

  for (const [, plugin] of registry.plugins) {
    if (!plugin.agents) continue

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) continue

    const missingEnv = (plugin.envVars ?? []).filter(
      (v) => v.required !== false && !envVars[v.name],
    )
    if (missingEnv.length > 0) {
      log.debug(
        `Plugin ${plugin.id} agents skipped (missing env: ${missingEnv.map((v) => v.name).join(', ')})`,
      )
      continue
    }

    for (const agentDef of plugin.agents.definitions) {
      const manifest = plugin.agents.manifests.get(agentDef.id)
      if (!manifest) continue

      const agentConfig = getAgentConfig(pluginConfig, agentDef.id)
      const modelConfig = agentConfig?.model ?? config.models.operator

      const inheritedTools = resolveInheritedTools(agentDef, globalTools)
      const { tools: modelNativeTools } = await resolveAgentModelTools(
        agentDef,
        config,
        pluginConfig,
      )

      const allTools = { ...inheritedTools, ...modelNativeTools }

      validateEntityId('agent', plugin.id, agentDef.id)
      const nsKey = namespacedKey(plugin.id, agentDef.id)
      result[nsKey] = new MastraAgent({
        id: nsKey,
        name: manifest.name,
        instructions: manifest.instructions,
        description: manifest.description,
        model: buildModelString(modelConfig),
        tools: allTools,
        memory,
      })
    }
  }

  return result
}
