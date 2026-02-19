import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface ProviderInfo {
  id: string
  name: string
  models: string[]
  configured: boolean
  docUrl?: string
  gateway: string
  envVars: string[]
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
