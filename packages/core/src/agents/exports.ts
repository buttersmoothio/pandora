/**
 * Public API for agent plugin authors.
 *
 * Import from `@pandora/core/agents` to define agents in external packages.
 */

export type { AgentDefinition } from './define'
export type {
  AgentManifest,
  AgentPluginConfig,
  AgentRecord,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  PluginConfig,
} from './types'
