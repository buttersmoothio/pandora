import type { Agent as MastraAgent } from '@mastra/core/agent'

export type { ConfigFieldDescriptor, EnvVarDescriptor, PluginConfig } from '@pandorakit/sdk'
export type { AgentManifest } from '@pandorakit/sdk/agents'

/** A record of agent instances keyed by agent ID */
export type AgentRecord = Record<string, MastraAgent>
