import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface McpToolOverview {
  id: string
  name: string
  description: string
}

export interface McpServerInfo {
  id: string
  name: string
  type: 'stdio' | 'sse'
  enabled: boolean
  requireApproval: boolean
  tools: McpToolOverview[]
  error?: string
}

interface McpServersResponse {
  servers: McpServerInfo[]
}

export const MCP_SERVERS_KEY = ['mcp-servers'] as const

export function useMcpServers() {
  const query = useQuery({
    queryKey: MCP_SERVERS_KEY,
    queryFn: () => apiFetch<McpServersResponse>('/api/mcp-servers'),
  })

  return {
    ...query,
    servers: query.data?.servers,
  }
}
