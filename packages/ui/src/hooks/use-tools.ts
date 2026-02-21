import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface ToolPermissions {
  time?: boolean
  network?: string[]
  env?: string[]
  fs?: string[]
  random?: boolean
}

export interface ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
}

export interface ToolInfo {
  id: string
  description: string
  permissions?: ToolPermissions
  sandbox: 'compartment' | 'host'
  annotations?: ToolAnnotations
  enabled: boolean
  requireApproval?: boolean
  settings?: Record<string, string>
}

export const TOOLS_KEY = ['tools'] as const

function fetchTools() {
  return apiFetch<{ tools: ToolInfo[] }>('/api/tools').then((res) => res.tools)
}

export function useTools() {
  return useQuery({
    queryKey: TOOLS_KEY,
    queryFn: fetchTools,
  })
}
