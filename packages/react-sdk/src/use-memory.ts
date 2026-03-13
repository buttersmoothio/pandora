'use client'

import type { RecordResponse } from '@pandorakit/sdk/client'
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { observationsKey, omRecordKey, workingMemoryKey } from './keys'
import { usePandoraClient } from './provider'

export interface UseMemoryOptions {
  /** Polling interval for observations and record queries in milliseconds. Defaults to `10_000`. */
  pollInterval?: number
}

export interface UseMemoryReturn {
  /** Long-term observations (Observational Memory text). Polled. */
  observations: UseQueryResult<{ observations: string | null }>
  /** OM processing record (thresholds, token counts). Polled. */
  record: UseQueryResult<RecordResponse>
  /** Short-term working memory content. */
  workingMemory: UseQueryResult<{ content: string | null }>
  /** Replace the working memory content. */
  updateWorkingMemory: (content: string) => Promise<{ content: string }>
}

/**
 * Access the agent's memory system — observations, processing record,
 * and working memory with read/write support.
 */
export function useMemory(options?: UseMemoryOptions): UseMemoryReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()
  const pollInterval = options?.pollInterval ?? 10_000

  const observations = useQuery({
    queryKey: observationsKey,
    queryFn: () => client.memory.getObservations() as Promise<{ observations: string | null }>,
    refetchInterval: pollInterval,
  })

  const record = useQuery({
    queryKey: omRecordKey,
    queryFn: () => client.memory.getRecord(),
    refetchInterval: pollInterval,
  })

  const workingMemory = useQuery({
    queryKey: workingMemoryKey,
    queryFn: () => client.memory.getWorkingMemory() as Promise<{ content: string | null }>,
  })

  const mutation = useMutation({
    mutationFn: (content: string) => client.memory.updateWorkingMemory(content),
    onSuccess: (data: { content: string }) => {
      queryClient.setQueryData(workingMemoryKey, data)
    },
  })

  const updateWorkingMemory = useCallback(
    (content: string) => mutation.mutateAsync(content),
    [mutation],
  )

  return {
    observations,
    record,
    workingMemory,
    updateWorkingMemory,
  }
}
