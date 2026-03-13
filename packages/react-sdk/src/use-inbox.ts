'use client'

import type { InboxMessage } from '@pandorakit/sdk/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { inboxKey } from './keys'
import { usePandoraClient } from './provider'

interface InboxListResponse {
  messages: InboxMessage[]
}

export interface UseInboxOptions {
  /** Polling interval in milliseconds. Defaults to `30_000`. */
  refetchInterval?: number
}

export interface UseInboxReturn {
  /** Inbox message list, or `undefined` while loading. */
  data: InboxListResponse | undefined
  isLoading: boolean
  error: Error | null
  /** Mark a message as read. */
  markRead: (id: string) => Promise<InboxMessage>
  /** Archive a message. */
  archive: (id: string) => Promise<InboxMessage>
  /** Restore an archived message. */
  unarchive: (id: string) => Promise<InboxMessage>
  /** Permanently delete a message. */
  remove: (id: string) => Promise<{ deleted: string }>
}

/**
 * Fetch and manage inbox messages.
 *
 * @param archived - When `true`, fetches archived messages instead.
 * @param options - Optional configuration (e.g. polling interval).
 */
export function useInbox(archived: boolean = false, options?: UseInboxOptions): UseInboxReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...inboxKey, { archived }],
    queryFn: () => client.inbox.list({ archived }),
    refetchInterval: options?.refetchInterval ?? 30_000,
  })

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: inboxKey }),
    [queryClient],
  )

  const markReadMutation = useMutation({
    mutationFn: (id: string) => client.inbox.update(id, { read: true }),
    onSuccess: invalidate,
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => client.inbox.update(id, { archived: true }),
    onSuccess: invalidate,
  })

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => client.inbox.update(id, { archived: false }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.inbox.delete(id),
    onSuccess: invalidate,
  })

  const markRead = useCallback((id: string) => markReadMutation.mutateAsync(id), [markReadMutation])
  const archive = useCallback((id: string) => archiveMutation.mutateAsync(id), [archiveMutation])
  const unarchive = useCallback(
    (id: string) => unarchiveMutation.mutateAsync(id),
    [unarchiveMutation],
  )
  const remove = useCallback((id: string) => deleteMutation.mutateAsync(id), [deleteMutation])

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    markRead,
    archive,
    unarchive,
    remove,
  }
}
