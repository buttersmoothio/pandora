import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

// Types mirroring packages/core/src/config.ts

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export interface ModelConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
}

export interface Config {
  identity: {
    name: string
  }
  timezone: string
  personality: {
    systemPrompt: string
  }
  models: {
    operator: ModelConfig
  }
  plugins: Record<string, { enabled: boolean; [key: string]: unknown }>
  memory: {
    semanticRecall: {
      enabled: boolean
      embedder?: string
    }
  }
  schedule: {
    enabled: boolean
    tasks: Array<{
      id: string
      name: string
      cron?: string
      runAt?: string
      prompt: string
      enabled: boolean
      maxRuns?: number
    }>
  }
  onboardingComplete: boolean
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
    mutationFn: (patch: DeepPartial<Config>) =>
      apiFetch<Config>('/api/config', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(CONFIG_KEY, data)
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
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
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Configuration reset to defaults')
    },
    onError: (err: Error) => {
      toast.error(`Failed to reset: ${err.message}`)
    },
  })
}
