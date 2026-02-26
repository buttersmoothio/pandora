import { useQuery } from '@tanstack/react-query'
import type { ConfigFieldDescriptor, EnvVarDescriptor } from '@/hooks/use-channels'
import type { ModelConfig } from '@/hooks/use-config'
import type { Alert } from '@/hooks/use-tools'
import { apiFetch } from '@/lib/api'

export interface ScopedToolInfo {
  id: string
  name: string
  description: string
  permissions?: Record<string, boolean | string[]>
  sandbox: 'compartment' | 'host'
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
  }
  timeout: number
  enabled: boolean
}

export interface AgentInfo {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  model?: ModelConfig
  tools: ScopedToolInfo[]
  alerts: Alert[]
}

export interface AgentPluginInfo {
  id: string
  name: string
  envVars: EnvVarDescriptor[]
  envConfigured: boolean
  configFields: ConfigFieldDescriptor[]
  enabled: boolean
  config: Record<string, unknown>
  validationErrors: string[]
  alerts: Alert[]
  agentIds: string[]
}

interface AgentsResponse {
  agents: AgentInfo[]
  plugins: AgentPluginInfo[]
}

export const AGENTS_KEY = ['agents'] as const

function fetchAgents() {
  return apiFetch<AgentsResponse>('/api/agents')
}

export function useAgents() {
  const query = useQuery({
    queryKey: AGENTS_KEY,
    queryFn: fetchAgents,
  })

  return {
    ...query,
    agents: query.data?.agents,
    plugins: query.data?.plugins,
  }
}
