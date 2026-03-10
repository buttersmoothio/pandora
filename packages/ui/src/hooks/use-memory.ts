import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import type { RecordResponse } from '@/lib/memory-utils'

const POLL_INTERVAL = 10_000
const WORKING_MEMORY_KEY = ['working-memory'] as const

export function useObservations() {
  return useQuery({
    queryKey: ['observations'],
    queryFn: () => apiFetch<{ observations: string | null }>('/api/memory/observations'),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useOMRecord() {
  return useQuery({
    queryKey: ['om-record'],
    queryFn: () => apiFetch<RecordResponse>('/api/memory/record'),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useWorkingMemory() {
  return useQuery({
    queryKey: WORKING_MEMORY_KEY,
    queryFn: () => apiFetch<{ content: string | null }>('/api/memory/working'),
  })
}

export function useUpdateWorkingMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ content: string }>('/api/memory/working', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(WORKING_MEMORY_KEY, data)
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })
}
