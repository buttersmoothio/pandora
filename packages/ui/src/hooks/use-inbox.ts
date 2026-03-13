import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

export type DeliveryStatus = 'pending' | 'sent' | 'failed'

export interface InboxMessage {
  id: string
  subject: string
  body: string
  threadId: string | null
  destination: string
  status: DeliveryStatus
  read: boolean
  createdAt: string
  archivedAt: string | null
}

interface InboxListResponse {
  messages: InboxMessage[]
}

export const INBOX_KEY = ['inbox'] as const

export function useInbox(archived: boolean = false): UseQueryResult<InboxListResponse> {
  return useQuery({
    queryKey: [...INBOX_KEY, { archived }],
    queryFn: () => apiFetch<InboxListResponse>(`/api/inbox${archived ? '?archived=true' : ''}`),
    refetchInterval: 30_000,
  })
}

export function useMarkInboxRead(): UseMutationResult<InboxMessage, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<InboxMessage>(`/api/inbox/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      }),
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
    mutationFn: (id: string) =>
      apiFetch<InboxMessage>(`/api/inbox/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      }),
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
    mutationFn: (id: string) =>
      apiFetch<InboxMessage>(`/api/inbox/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: false }),
      }),
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
    mutationFn: (id: string) =>
      apiFetch<{ deleted: string }>(`/api/inbox/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete message: ${err.message}`)
    },
  })
}
