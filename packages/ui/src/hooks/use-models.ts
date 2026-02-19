import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface ProviderInfo {
  id: string
  name: string
  models: string[]
}

interface ModelsResponse {
  providers: ProviderInfo[]
}

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => apiFetch<ModelsResponse>('/api/models'),
    staleTime: 5 * 60 * 1000,
  })
}
