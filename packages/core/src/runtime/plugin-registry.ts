import type { z } from 'zod'
import type { AgentDefinition } from '../agents/define'
import type { AgentManifest } from '../agents/types'
import type { ChannelFactory } from '../channels/types'
import type {
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  ResolveToolsContext,
  ResolveToolsResult,
} from '../plugin-types'
import type { SandboxMode, ToolExport, ToolManifest, ToolPermissions } from '../tools/types'

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
    entries: ToolExport[]
    resolveTools?: (ctx: ResolveToolsContext) => Promise<ResolveToolsResult>
    manifests: Map<string, ToolManifest>
    sandbox?: SandboxMode
    permissions?: ToolPermissions
    requireApproval?: boolean
  }
  agents?: {
    definitions: AgentDefinition[]
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
