import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/lib/api'

export type { Config, DeepPartial, ModelConfig } from '@pandorakit/sdk/client'

import type { Config, DeepPartial } from '@pandorakit/sdk/client'

const CONFIG_KEY = ['config'] as const

export function useConfig(): UseQueryResult<Config> {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => client.config.get(),
  })
}

export function useUpdateConfig(): UseMutationResult<Config, Error, DeepPartial<Config>> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch: DeepPartial<Config>) => client.config.update(patch),
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
