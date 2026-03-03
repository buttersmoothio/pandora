import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

export interface Thread {
  id: string
  title?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
  activeThreadId?: string
  threadIds?: string[]
}

export interface ForkInfo {
  sourceThreadId: string
  forkPointIndex: number
  siblings: { id: string; title?: string }[]
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
      return ids?.length ? 1000 : 30_000
    },
  })
}

export function useForkThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, messageId }: { threadId: string; messageId: string }) =>
      apiFetch<{ thread: Thread; clonedMessageCount: number }>(`/api/threads/${threadId}/fork`, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
    onError: (err: Error) => toast.error(`Failed to fork thread: ${err.message}`),
  })
}

export function useDeleteThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(`/api/threads/${threadId}`, { method: 'DELETE' }),
    onSuccess: (_data, threadId) => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY })
      queryClient.removeQueries({ queryKey: ['thread', threadId] })
      toast.success('Thread deleted')
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete thread: ${err.message}`)
    },
  })
}
