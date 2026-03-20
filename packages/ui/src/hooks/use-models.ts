'use client'

import type { ProviderInfo } from '@pandorakit/sdk/client'
import { useQuery } from '@tanstack/react-query'
import { usePandoraClient } from '@/providers/pandora-provider'
import { modelsKey } from './query-keys'

interface ModelsResponse {
  data: ProviderInfo[]
}

export interface UseModelsReturn {
  /** Full models response, or `undefined` while loading. */
  data: ModelsResponse | undefined
  /** Shorthand for `data.data`. */
  providers: ProviderInfo[] | undefined
  isLoading: boolean
  error: Error | null
}

/** Fetch available AI model providers. */
export function useModels(): UseModelsReturn {
  const client = usePandoraClient()
  const query = useQuery({
    queryKey: modelsKey,
    queryFn: () => client.models.list(),
    staleTime: 5 * 60 * 1000,
  })

  return {
    data: query.data,
    providers: query.data?.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
