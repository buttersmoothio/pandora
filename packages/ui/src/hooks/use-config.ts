import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

// Types mirroring packages/core/src/config.ts

/** Recursive partial where `null` means "delete this key" (matches server-side deepMerge). */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> | null : T[K] | null
}

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
  mcpServers: Record<
    string,
    {
      command?: string
      args?: string[]
      url?: string
      enabled: boolean
      name?: string
      permissions?: {
        network?: string[]
        env?: string[]
        fs?: { denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }
      }
      requireApproval: boolean
      headers?: Record<string, string>
      oauth?: boolean
    }
  >
  memory: {
    enabled: boolean
    model?: string
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

function fetchConfig(): Promise<Config> {
  return apiFetch<Config>('/api/config')
}

export function useConfig(): UseQueryResult<Config> {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: fetchConfig,
  })
}

export function useUpdateConfig(): UseMutationResult<Config, Error, DeepPartial<Config>> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch: DeepPartial<Config>) =>
      apiFetch<Config>('/api/config', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data: Config) => {
      queryClient.setQueryData(CONFIG_KEY, data)
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })
}
