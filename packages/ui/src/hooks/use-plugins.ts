import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import type {
  Alert,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  ToolPermissions,
} from './plugin-types'

export interface ToolOverview {
  id: string
  name: string
  description: string
}

export interface ToolsProvides {
  toolIds: string[]
  tools: ToolOverview[]
  sandbox?: string
  permissions?: ToolPermissions
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

/**
 * Sanitise a namespaced tool key the same way the AI SDK does
 * (`@pandorakit/brave-search:brave_search` → `_pandorakit_brave-search_brave_search`).
 */
function sanitiseToolId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Build a lookup map from sanitised tool key → human-readable name.
 * Also maps agent IDs to their display names.
 */
/**
 * Build a lookup map from channel namespaced key → human-readable plugin name.
 * Used to display friendly names for inbox message destinations.
 */
export function useChannelNames(): Map<string, string> {
  const { plugins } = usePlugins()
  return useMemo(() => {
    const map = new Map<string, string>()
    if (!plugins) return map
    for (const plugin of plugins) {
      if (plugin.provides.channels?.loaded) {
        // The nsKey is `pluginId:channelId` — we don't know the channelId here,
        // so we match any destination that starts with `pluginId:`
        map.set(plugin.id, plugin.name)
      }
    }
    return map
  }, [plugins])
}

function buildToolNameMap(plugins: UnifiedPluginInfo[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const plugin of plugins) {
    if (plugin.provides.tools) {
      for (const tool of plugin.provides.tools.tools) {
        // tool.id is already namespaced (e.g. "@pandorakit/brave-search:brave_search")
        map.set(sanitiseToolId(tool.id), tool.name)
      }
    }
    if (plugin.provides.agents) {
      for (const agent of plugin.provides.agents.agents) {
        // Mastra prefixes agent tool keys with `agent-` (e.g. `agent-@pandorakit/research-agent:research`)
        map.set(`agent-${sanitiseToolId(agent.id)}`, agent.name)
      }
    }
  }
  return map
}

export function useToolNames(): Map<string, string> {
  const { plugins } = usePlugins()
  return useMemo(() => (plugins ? buildToolNameMap(plugins) : new Map()), [plugins])
}
