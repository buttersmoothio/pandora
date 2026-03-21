'use client'

import type { UnifiedPluginInfo } from '@pandorakit/sdk/client'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { pluginsKey } from './keys'
import { usePandoraClient } from './provider'

interface PluginsResponse {
  plugins: UnifiedPluginInfo[]
}

export interface UsePluginsReturn {
  /** Full plugins response, or `undefined` while loading. */
  data: PluginsResponse | undefined
  /** Shorthand for `data.plugins`. */
  plugins: UnifiedPluginInfo[] | undefined
  isLoading: boolean
  error: Error | null
  /** Map of sanitised tool ID → display name for plugin-provided tools. */
  toolNames: Map<string, string>
  /** Map of plugin ID → display name for plugins that provide channels. */
  channelNames: Map<string, string>
}

/** Sanitise a namespaced tool key to match the LLM-safe format used in tool call parts. */
export function sanitiseToolId(id: string): string {
  return id.replace(/@/g, '').replace(/[/:]/g, '_').replace(/_+/g, '_').replace(/^_/, '')
}

/** Build a map of sanitised tool/agent ID → display name from a list of plugins. */
export function buildToolNameMap(plugins: UnifiedPluginInfo[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const plugin of plugins) {
    if (plugin.provides.tools) {
      for (const tool of plugin.provides.tools.tools) {
        map.set(sanitiseToolId(tool.id), tool.name)
      }
    }
    if (plugin.provides.agents) {
      for (const agent of plugin.provides.agents.agents) {
        map.set(`agent-${sanitiseToolId(agent.id)}`, agent.name)
      }
    }
  }
  return map
}

function buildChannelNameMap(plugins: UnifiedPluginInfo[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const plugin of plugins) {
    if (plugin.provides.channels?.loaded) {
      map.set(plugin.id, plugin.name)
    }
  }
  return map
}

/**
 * Fetch installed plugins and derive tool/channel name maps.
 *
 * For a merged tool-name map that includes MCP server tools,
 * use {@link useToolNames} instead.
 */
export function usePlugins(): UsePluginsReturn {
  const client = usePandoraClient()

  const query = useQuery({
    queryKey: pluginsKey,
    queryFn: () => client.plugins.list(),
  })

  const plugins = query.data?.plugins

  const toolNames = useMemo(
    () => (plugins ? buildToolNameMap(plugins) : new Map<string, string>()),
    [plugins],
  )

  const channelNames = useMemo(
    () => (plugins ? buildChannelNameMap(plugins) : new Map<string, string>()),
    [plugins],
  )

  return {
    data: query.data,
    plugins,
    isLoading: query.isLoading,
    error: query.error,
    toolNames,
    channelNames,
  }
}
