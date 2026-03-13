import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/lib/api'

export type {
  BranchRef,
  ForkInfo,
  Thread,
  ThreadDetailResponse,
  ThreadForkResponse,
  ThreadListResponse,
} from '@pandorakit/sdk/client'

import type { ThreadForkResponse, ThreadListResponse } from '@pandorakit/sdk/client'

export const THREADS_KEY = ['threads'] as const

export function useThreads(): UseQueryResult<ThreadListResponse> {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: () => client.threads.list(),
    refetchInterval: (query: { state: { data: ThreadListResponse | undefined } }) => {
      const ids = query.state.data?.activeStreamIds
      return ids?.length ? 1000 : 30_000
    },
  })
}

export function useForkThread(): UseMutationResult<
  ThreadForkResponse,
  Error,
  { threadId: string; messageId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, messageId }: { threadId: string; messageId: string }) =>
      client.threads.fork(threadId, messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
    onError: (err: Error) => toast.error(`Failed to fork thread: ${err.message}`),
  })
}

export function useDeleteThread(): UseMutationResult<{ success: true }, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (threadId: string) => client.threads.delete(threadId),
    onSuccess: (_data: { success: true }, threadId: string) => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY })
      queryClient.removeQueries({ queryKey: ['thread', threadId] })
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete thread: ${err.message}`)
    },
  })
}
