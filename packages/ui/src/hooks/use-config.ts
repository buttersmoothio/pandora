import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

// Types mirroring packages/core/src/config.ts

export interface ModelConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
}

export interface ToolConfig {
  enabled: boolean
  settings?: Record<string, string>
  requireApproval?: boolean
}

export interface Config {
  identity: {
    name: string
  }
  personality: {
    systemPrompt: string
  }
  models: {
    operator: ModelConfig
  }
  tools: Record<string, ToolConfig>
}

const CONFIG_KEY = ['config'] as const

function fetchConfig() {
  return apiFetch<Config>('/api/config')
}

export function useConfig() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: fetchConfig,
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch: Partial<Config>) =>
      apiFetch<Config>('/api/config', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(CONFIG_KEY, data)
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      toast.success('Configuration saved')
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })
}

export function useResetConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiFetch<Config>('/api/config', { method: 'DELETE' }),
    onSuccess: (data) => {
      queryClient.setQueryData(CONFIG_KEY, data)
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      toast.success('Configuration reset to defaults')
    },
    onError: (err: Error) => {
      toast.error(`Failed to reset: ${err.message}`)
    },
  })
}
