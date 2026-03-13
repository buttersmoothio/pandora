import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import type { RecordResponse } from '@/lib/memory-utils'

const POLL_INTERVAL = 10_000
const WORKING_MEMORY_KEY = ['working-memory'] as const

export function useObservations(): UseQueryResult<{ observations: string | null }> {
  return useQuery({
    queryKey: ['observations'],
    queryFn: () => apiFetch<{ observations: string | null }>('/api/memory/observations'),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useOMRecord(): UseQueryResult<RecordResponse> {
  return useQuery({
    queryKey: ['om-record'],
    queryFn: () => apiFetch<RecordResponse>('/api/memory/record'),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useWorkingMemory(): UseQueryResult<{ content: string | null }> {
  return useQuery({
    queryKey: WORKING_MEMORY_KEY,
    queryFn: () => apiFetch<{ content: string | null }>('/api/memory/working'),
  })
}

export function useUpdateWorkingMemory(): UseMutationResult<{ content: string }, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ content: string }>('/api/memory/working', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (data: { content: string }) => {
      queryClient.setQueryData(WORKING_MEMORY_KEY, data)
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })
}
