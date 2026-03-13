import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/lib/api'
import type { RecordResponse } from '@/lib/memory-utils'

const POLL_INTERVAL = 10_000
const WORKING_MEMORY_KEY = ['working-memory'] as const

export function useObservations(): UseQueryResult<{ observations: string | null }> {
  return useQuery({
    queryKey: ['observations'],
    queryFn: () => client.memory.getObservations() as Promise<{ observations: string | null }>,
    refetchInterval: POLL_INTERVAL,
  })
}

export function useOMRecord(): UseQueryResult<RecordResponse> {
  return useQuery({
    queryKey: ['om-record'],
    queryFn: () => client.memory.getRecord(),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useWorkingMemory(): UseQueryResult<{ content: string | null }> {
  return useQuery({
    queryKey: WORKING_MEMORY_KEY,
    queryFn: () => client.memory.getWorkingMemory() as Promise<{ content: string | null }>,
  })
}

export function useUpdateWorkingMemory(): UseMutationResult<{ content: string }, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => client.memory.updateWorkingMemory(content),
    onSuccess: (data: { content: string }) => {
      queryClient.setQueryData(WORKING_MEMORY_KEY, data)
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })
}
