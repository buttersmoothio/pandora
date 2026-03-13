'use client'

import type { Config, DeepPartial } from '@pandorakit/sdk/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { configKey, mcpServersKey, pluginsKey } from './keys'
import { usePandoraClient } from './provider'

export interface UseConfigReturn {
  /** Current server configuration, or `undefined` while loading. */
  data: Config | undefined
  isLoading: boolean
  error: Error | null
  /** Apply a partial config update. Returns the updated config. */
  update: (patch: DeepPartial<Config>) => Promise<Config>
  /** Whether a config update is currently in flight. */
  isUpdating: boolean
}

/** Fetch and update the server configuration. */
export function useConfig(): UseConfigReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: configKey,
    queryFn: () => client.config.get(),
  })

  const mutation = useMutation({
    mutationFn: (patch: DeepPartial<Config>) => client.config.update(patch),
    onSuccess: (data: Config) => {
      queryClient.setQueryData(configKey, data)
      queryClient.invalidateQueries({ queryKey: pluginsKey })
      queryClient.invalidateQueries({ queryKey: mcpServersKey })
    },
  })

  const update = useCallback(
    (patch: DeepPartial<Config>) => mutation.mutateAsync(patch),
    [mutation],
  )

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    update,
    isUpdating: mutation.isPending,
  }
}
