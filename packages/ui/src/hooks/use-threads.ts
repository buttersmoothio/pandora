import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
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

export function useThreads(): UseQueryResult<ThreadListResponse> {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: () => apiFetch<ThreadListResponse>('/api/threads'),
    refetchInterval: (query: { state: { data: ThreadListResponse | undefined } }) => {
      const ids = query.state.data?.activeStreamIds
      return ids?.length ? 1000 : 30_000
    },
  })
}

export function useForkThread(): UseMutationResult<
  { thread: Thread; clonedMessageCount: number },
  Error,
  { threadId: string; messageId: string }
> {
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

export function useDeleteThread(): UseMutationResult<{ success: boolean }, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) =>
      apiFetch<{ success: boolean }>(`/api/threads/${threadId}`, { method: 'DELETE' }),
    onSuccess: (_data: { success: boolean }, threadId: string) => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY })
      queryClient.removeQueries({ queryKey: ['thread', threadId] })
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete thread: ${err.message}`)
    },
  })
}
