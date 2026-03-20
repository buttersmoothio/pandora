'use client'

import type {
  ThreadDetailResponse,
  ThreadForkResponse,
  ThreadListResponse,
} from '@pandorakit/sdk/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { usePandoraClient } from '@/providers/pandora-provider'
import { threadsKey } from './query-keys'

export interface UseThreadsReturn {
  /** Thread list with active stream IDs, or `undefined` while loading. */
  data: ThreadListResponse | undefined
  isLoading: boolean
  error: Error | null
  /** Fork a thread at a specific message, creating a new branch. */
  fork: (args: { threadId: string; messageId: string }) => Promise<ThreadForkResponse>
  /** Delete a thread by ID. */
  remove: (threadId: string) => Promise<void>
}

/** List, fork, and delete threads. Automatically refreshes when streams are active. */
export function useThreads(): UseThreadsReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: threadsKey,
    queryFn: () => client.threads.list(),
    refetchInterval: (q: { state: { data: ThreadListResponse | undefined } }) => {
      const ids = q.state.data?.activeStreamIds
      return ids?.length ? 1000 : 30_000
    },
  })

  const forkMutation = useMutation({
    mutationFn: ({ threadId, messageId }: { threadId: string; messageId: string }) =>
      client.threads.fork(threadId, messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: threadsKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => client.threads.delete(threadId),
    onSuccess: (_data: { success: true }, threadId: string) => {
      queryClient.invalidateQueries({ queryKey: threadsKey })
      queryClient.removeQueries({ queryKey: ['thread', threadId] })
    },
  })

  const fork = useCallback(
    (args: { threadId: string; messageId: string }) => forkMutation.mutateAsync(args),
    [forkMutation],
  )

  const remove = useCallback(
    async (threadId: string): Promise<void> => {
      await deleteMutation.mutateAsync(threadId)
    },
    [deleteMutation],
  )

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    fork,
    remove,
  }
}

export interface UseThreadReturn {
  /** Thread detail including messages and fork info, or `undefined` while loading. */
  data: ThreadDetailResponse | undefined
  isLoading: boolean
  error: Error | null
}

/** Fetch a single thread by ID, including its messages and fork metadata. */
export function useThread(id: string): UseThreadReturn {
  const client = usePandoraClient()

  const query = useQuery({
    queryKey: ['thread', id],
    queryFn: () => client.threads.get(id) as Promise<ThreadDetailResponse>,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
