import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/lib/api'

export type { AddMcpServerInput, McpServerInfo, McpToolOverview } from '@pandorakit/sdk/client'

import type { AddMcpServerInput, McpServerInfo } from '@pandorakit/sdk/client'

interface McpServersResponse {
  servers: McpServerInfo[]
}

export const MCP_SERVERS_KEY = ['mcp-servers'] as const

export function useMcpServers(): {
  servers: McpServerInfo[] | undefined
} & ReturnType<typeof useQuery<McpServersResponse>> {
  const query = useQuery({
    queryKey: MCP_SERVERS_KEY,
    queryFn: () => client.mcpServers.list(),
  })

  return {
    ...query,
    servers: query.data?.servers,
  }
}

export function useAddMcpServer(): UseMutationResult<{ id: string }, Error, AddMcpServerInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serverConfig: AddMcpServerInput) => client.mcpServers.add(serverConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MCP_SERVERS_KEY })
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (err: Error) => {
      toast.error(`Failed to add server: ${err.message}`)
    },
  })
}
