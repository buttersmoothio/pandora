import { Agent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import type { AgentDefinition } from '../agents/define'
import type { ModelToolKey } from '../agents/model-tools'
import { resolveModelTools } from '../agents/model-tools'
import type { AgentPluginConfig, AgentRecord } from '../agents/types'
import type { Config } from '../config'
import { buildModelString } from '../mastra/models'
import type { Alert } from '../plugin-types'
import type { ToolRecord } from '../tools/types'
import { validatePluginConfig } from './config-validate'
import type { PluginRegistry } from './plugin-registry'

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

function resolveInheritedTools(agentDef: AgentDefinition, globalTools: ToolRecord): ToolRecord {
  const tools: ToolRecord = {}
  for (const id of agentDef.useTools ?? []) {
    if (globalTools[id]) tools[id] = globalTools[id]
  }
  return tools
}

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

export async function loadAgents(
  registry: PluginRegistry,
  config: Config,
  memory: MastraMemory,
  globalTools: ToolRecord = {},
): Promise<AgentRecord> {
  const result: AgentRecord = {}

  for (const [, plugin] of registry.plugins) {
    if (!plugin.agents) continue

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) continue

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

      result[agentDef.id] = new Agent({
        id: manifest.id,
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
