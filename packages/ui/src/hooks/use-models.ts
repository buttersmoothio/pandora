import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { client } from '@/lib/api'

export type { ProviderInfo } from '@pandorakit/sdk/client'

import type { ProviderInfo } from '@pandorakit/sdk/client'

interface ModelsResponse {
  providers: ProviderInfo[]
}

export function useModels(): UseQueryResult<ModelsResponse> {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => client.models.list(),
    staleTime: 5 * 60 * 1000,
  })
}
