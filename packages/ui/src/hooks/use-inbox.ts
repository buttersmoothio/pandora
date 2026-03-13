import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/lib/api'

export type { DeliveryStatus, InboxMessage } from '@pandorakit/sdk/client'

import type { InboxMessage } from '@pandorakit/sdk/client'

interface InboxListResponse {
  messages: InboxMessage[]
}

export const INBOX_KEY = ['inbox'] as const

export function useInbox(archived: boolean = false): UseQueryResult<InboxListResponse> {
  return useQuery({
    queryKey: [...INBOX_KEY, { archived }],
    queryFn: () => client.inbox.list({ archived }),
    refetchInterval: 30_000,
  })
}

export function useMarkInboxRead(): UseMutationResult<InboxMessage, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => client.inbox.update(id, { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to mark message as read: ${err.message}`)
    },
  })
}

export function useArchiveInboxMessage(): UseMutationResult<InboxMessage, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => client.inbox.update(id, { archived: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to archive message: ${err.message}`)
    },
  })
}

export function useUnarchiveInboxMessage(): UseMutationResult<InboxMessage, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => client.inbox.update(id, { archived: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to restore message: ${err.message}`)
    },
  })
}

export function useDeleteInboxMessage(): UseMutationResult<{ deleted: string }, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => client.inbox.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete message: ${err.message}`)
    },
  })
}
