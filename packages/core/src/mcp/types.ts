import type { z } from 'zod'
import type { McpServerSchema } from './schema'

export type McpServerConfig = z.infer<typeof McpServerSchema>

export interface McpServerMeta {
  id: string
  name: string
  type: 'stdio' | 'sse'
  enabled: boolean
  requireApproval: boolean
  tools: { id: string; name: string; description: string }[]
  error?: string
  authUrl?: string
}
