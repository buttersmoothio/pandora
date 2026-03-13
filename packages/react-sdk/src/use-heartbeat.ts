'use client'

import type { HeartbeatConfig } from '@pandorakit/sdk/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { heartbeatKey, schedulesKey } from './keys'
import { usePandoraClient } from './provider'

export interface UseHeartbeatReturn {
  /** Current heartbeat configuration, or `undefined` while loading. */
  data: HeartbeatConfig | undefined
  isLoading: boolean
  error: Error | null
  /** Apply a partial update to the heartbeat config. */
  update: (patch: Partial<HeartbeatConfig>) => Promise<HeartbeatConfig>
  /** Whether an update is currently in flight. */
  isUpdating: boolean
}

/** Fetch and update the heartbeat (periodic health-check) configuration. */
export function useHeartbeat(): UseHeartbeatReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: heartbeatKey,
    queryFn: () => client.schedule.heartbeat(),
  })

  const mutation = useMutation({
    mutationFn: (patch: Partial<HeartbeatConfig>) => client.schedule.updateHeartbeat(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: heartbeatKey })
      queryClient.invalidateQueries({ queryKey: schedulesKey })
    },
  })

  const update = useCallback(
    (patch: Partial<HeartbeatConfig>) => mutation.mutateAsync(patch),
    [mutation],
  )

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    update,
    isUpdating: mutation.isPending,
  }
}
