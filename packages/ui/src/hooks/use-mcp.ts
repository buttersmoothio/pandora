import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

export interface McpToolOverview {
  id: string
  name: string
  description: string
}

export interface McpServerInfo {
  id: string
  name: string
  type: 'stdio' | 'http'
  enabled: boolean
  requireApproval: boolean
  tools: McpToolOverview[]
  error?: string
  authUrl?: string
}

interface McpServersResponse {
  servers: McpServerInfo[]
}

export const MCP_SERVERS_KEY = ['mcp-servers'] as const

export function useMcpServers(): {
  servers: McpServerInfo[] | undefined
} & ReturnType<typeof useQuery<McpServersResponse>> {
  const query = useQuery({
    queryKey: MCP_SERVERS_KEY,
    queryFn: () => apiFetch<McpServersResponse>('/api/mcp-servers'),
  })

  return {
    ...query,
    servers: query.data?.servers,
  }
}

export function useAddMcpServer(): UseMutationResult<
  { id: string },
  Error,
  Record<string, unknown>
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serverConfig: Record<string, unknown>) =>
      apiFetch<{ id: string }>('/api/mcp-servers', {
        method: 'POST',
        body: JSON.stringify(serverConfig),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MCP_SERVERS_KEY })
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (err: Error) => {
      toast.error(`Failed to add server: ${err.message}`)
    },
  })
}
