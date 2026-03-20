'use client'

import type { AddMcpServerInput, McpServerInfo } from '@pandorakit/sdk/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { usePandoraClient } from '@/providers/pandora-provider'
import { configKey, mcpServersKey } from './query-keys'

interface McpServersResponse {
  data: McpServerInfo[]
}

export interface UseMcpServersReturn {
  /** Raw response, or `undefined` while loading. */
  data: McpServersResponse | undefined
  /** Shorthand for `data.data`. */
  servers: McpServerInfo[] | undefined
  isLoading: boolean
  error: Error | null
  /** Register a new MCP server. Returns the new server's ID. */
  add: (input: AddMcpServerInput) => Promise<{ id: string }>
  /** Whether an add operation is currently in flight. */
  isAdding: boolean
}

/** List configured MCP servers and register new ones. */
export function useMcpServers(): UseMcpServersReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: mcpServersKey,
    queryFn: () => client.mcpServers.list(),
  })

  const addMutation = useMutation({
    mutationFn: (input: AddMcpServerInput) => client.mcpServers.add(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpServersKey })
      queryClient.invalidateQueries({ queryKey: configKey })
    },
  })

  const add = useCallback(
    (input: AddMcpServerInput) => addMutation.mutateAsync(input),
    [addMutation],
  )

  return {
    data: query.data,
    servers: query.data?.data,
    isLoading: query.isLoading,
    error: query.error,
    add,
    isAdding: addMutation.isPending,
  }
}
