'use client'

import { useMemo } from 'react'
import { useMcpServers } from './use-mcp'
import { buildToolNameMap, sanitiseToolId, usePlugins } from './use-plugins'

/**
 * High-level convenience hook that builds a merged tool-name map
 * from both installed plugins and MCP servers.
 *
 * Use this when rendering tool calls and you need display names
 * for every possible tool. If you only need plugin data, prefer
 * {@link usePlugins} directly.
 */
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
