import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Thread {
  id: string
  title?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface ThreadListResponse {
  threads: Thread[]
  total: number
  page: number
  perPage: number | false
  hasMore: boolean
  activeStreamIds?: string[]
}

export const THREADS_KEY = ['threads'] as const

export function useThreads() {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: () => apiFetch<ThreadListResponse>('/api/threads'),
    refetchInterval: (query) => {
      const ids = query.state.data?.activeStreamIds
      return ids?.length ? 3000 : false
    },
  })
}
