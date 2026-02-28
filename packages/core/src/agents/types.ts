import type { Agent } from '@mastra/core/agent'
import type { PluginConfig } from '../plugin-types'

export type { ConfigFieldDescriptor, EnvVarDescriptor, PluginConfig } from '../plugin-types'

/** Per-plugin user configuration for agent plugins */
export interface AgentPluginConfig extends PluginConfig {}

/** A record of agent instances keyed by agent ID */
export type AgentRecord = Record<string, Agent>

/** Complete metadata manifest for a Pandora subagent. */
export interface AgentManifest {
  /** Unique agent identifier. */
  id: string
  /** Human-readable display name. */
  name: string
  /** Human-readable description of what this agent does. */
  description: string
  /** System instructions for the agent. */
  instructions: string
}
