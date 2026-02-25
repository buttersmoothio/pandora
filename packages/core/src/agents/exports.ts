/**
 * Public API for agent plugin authors.
 *
 * Import from `@pandora/core/agents` to define agents in external packages.
 */

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
