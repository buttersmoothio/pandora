import type { ConfigFieldDescriptor, EnvVarDescriptor, ResolveToolsContext } from '@pandorakit/sdk'
import type { Agent, AgentManifest } from '@pandorakit/sdk/agents'
import type { ChannelFactory } from '@pandorakit/sdk/channels'
import type {
  ResolveToolsResult,
  SandboxMode,
  Tool,
  ToolManifest,
  ToolPermissions,
} from '@pandorakit/sdk/tools'
import type { z } from 'zod'

export interface RegisteredPlugin {
  id: string
  name: string
  description?: string
  author?: string
  icon?: string
  version?: string
  homepage?: string
  repository?: string
  license?: string
  envVars: EnvVarDescriptor[]
  configFields: ConfigFieldDescriptor[]
  schema?: z.ZodObject

  tools?: {
    entries: Tool[]
    resolveTools?: (ctx: ResolveToolsContext) => Promise<ResolveToolsResult>
    manifests: Map<string, ToolManifest>
    sandbox?: SandboxMode
    permissions?: ToolPermissions
    requireApproval?: boolean
  }
  agents?: {
    definitions: Agent[]
    manifests: Map<string, AgentManifest>
  }
  channels?: {
    factory: ChannelFactory
  }
}

export interface PluginRegistry {
  plugins: Map<string, RegisteredPlugin>
}

export function createPluginRegistry(): PluginRegistry {
  return { plugins: new Map() }
}
