import { useQuery } from '@tanstack/react-query'
import type { ConfigFieldDescriptor, EnvVarDescriptor } from '@/hooks/use-channels'
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
  name: string
  description: string
  permissions?: ToolPermissions
  sandbox: 'compartment' | 'host'
  annotations?: ToolAnnotations
  timeout: number
  enabled: boolean
  requireApproval?: boolean
  settings?: Record<string, string>
}

export interface ToolPluginInfo {
  id: string
  name: string
  envVars: EnvVarDescriptor[]
  envConfigured: boolean
  configFields: ConfigFieldDescriptor[]
  enabled: boolean
  config: Record<string, unknown>
  validationErrors: string[]
  toolIds: string[]
}

interface ToolsResponse {
  tools: ToolInfo[]
  plugins: ToolPluginInfo[]
}

export const TOOLS_KEY = ['tools'] as const

function fetchTools() {
  return apiFetch<ToolsResponse>('/api/tools')
}

export function useTools() {
  const query = useQuery({
    queryKey: TOOLS_KEY,
    queryFn: fetchTools,
  })

  return {
    ...query,
    tools: query.data?.tools,
    plugins: query.data?.plugins,
  }
}
