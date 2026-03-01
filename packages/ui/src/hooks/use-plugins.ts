import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { Alert, ConfigFieldDescriptor, EnvVarDescriptor } from './plugin-types'

export interface ToolOverview {
  id: string
  name: string
  description: string
}

export interface ToolsProvides {
  toolIds: string[]
  tools: ToolOverview[]
  sandbox?: string
  permissions?: Record<string, unknown>
  requireApproval?: boolean
  alerts: Alert[]
}

export interface AgentOverview {
  id: string
  name: string
  description: string
  model?: { provider: string; model: string }
  tools: { id: string; name: string; description: string }[]
  alerts: Alert[]
}

export interface AgentsProvides {
  agentIds: string[]
  agents: AgentOverview[]
  alerts: Alert[]
}

export interface ChannelsProvides {
  loaded: boolean
  webhook: boolean | null
  realtime: boolean | null
}

export interface PluginProvides {
  tools?: ToolsProvides
  agents?: AgentsProvides
  channels?: ChannelsProvides
}

export interface UnifiedPluginInfo {
  id: string
  name: string
  description?: string
  author?: string
  icon?: string
  version?: string
  homepage?: string
  repository?: string
  license?: string
  envVars: (EnvVarDescriptor & { configured?: boolean })[]
  envConfigured: boolean
  configFields: ConfigFieldDescriptor[]
  enabled: boolean
  config: Record<string, unknown>
  provides: PluginProvides
  validationErrors: string[]
}

interface PluginsResponse {
  plugins: UnifiedPluginInfo[]
}

export const PLUGINS_KEY = ['plugins'] as const

function fetchPlugins() {
  return apiFetch<PluginsResponse>('/api/plugins')
}

export function usePlugins() {
  const query = useQuery({
    queryKey: PLUGINS_KEY,
    queryFn: fetchPlugins,
  })

  return {
    ...query,
    plugins: query.data?.plugins,
  }
}
