import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { client } from '@/lib/api'
import { useMcpServers } from './use-mcp'

export type {
  AgentOverview,
  AgentsProvides,
  ChannelsProvides,
  PluginProvides,
  ToolOverview,
  ToolsProvides,
  UnifiedPluginInfo,
} from '@pandorakit/sdk/client'

import type { UnifiedPluginInfo } from '@pandorakit/sdk/client'

interface PluginsResponse {
  plugins: UnifiedPluginInfo[]
}

export const PLUGINS_KEY = ['plugins'] as const

export function usePlugins(): {
  plugins: UnifiedPluginInfo[] | undefined
} & ReturnType<typeof useQuery<PluginsResponse>> {
  const query = useQuery({
    queryKey: PLUGINS_KEY,
    queryFn: () => client.plugins.list(),
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
export function sanitiseToolId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Build a lookup map from channel namespaced key → human-readable plugin name.
 * Used to display friendly names for inbox message destinations.
 */
export function useChannelNames(): Map<string, string> {
  const { plugins } = usePlugins()
  return useMemo(() => {
    const map = new Map<string, string>()
    if (!plugins) {
      return map
    }
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

export function buildToolNameMap(plugins: UnifiedPluginInfo[]): Map<string, string> {
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
  const { servers } = useMcpServers()
  return useMemo(() => {
    const map = plugins ? buildToolNameMap(plugins) : new Map<string, string>()
    if (servers) {
      for (const server of servers) {
        for (const tool of server.tools) {
          map.set(sanitiseToolId(tool.id), tool.name)
        }
      }
    }
    return map
  }, [plugins, servers])
}
