export type { ConfigFieldDescriptor, EnvVarDescriptor, PluginConfig } from './common'

/** An agent definition exported from agent plugin entry points. */
export interface Agent {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  /** Tool IDs to pull from the tool registry. */
  useTools?: string[]
  /** Model-native tool keys (e.g. 'search'). */
  modelTools?: string[]
}

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
