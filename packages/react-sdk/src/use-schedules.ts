'use client'

import type { CreateScheduleInput, ScheduleTask, UpdateScheduleInput } from '@pandorakit/sdk/client'
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { destinationsKey, schedulesKey } from './keys'
import { usePandoraClient } from './provider'

interface ScheduleListResponse {
  data: ScheduleTask[]
  total: number
  page: number
  perPage: number | false
  hasMore: boolean
  enabled: boolean
}

export interface UseSchedulesReturn {
  /** Schedule list including global enabled state, or `undefined` while loading. */
  data: ScheduleListResponse | undefined
  isLoading: boolean
  error: Error | null
  /** Available delivery destinations (e.g. channel plugin IDs). */
  destinations: UseQueryResult<{ data: string[] }>
  /** Create a new scheduled task. */
  create: (input: CreateScheduleInput) => Promise<ScheduleTask>
  /** Update an existing scheduled task. */
  update: (input: UpdateScheduleInput & { id: string }) => Promise<ScheduleTask>
  /** Delete a scheduled task by ID. */
  remove: (id: string) => Promise<{ id: string }>
}

/** Manage scheduled tasks — list, create, update, and delete. */
export function useSchedules(): UseSchedulesReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: schedulesKey,
    queryFn: () => client.schedule.list(),
  })

  const destinations = useQuery({
    queryKey: destinationsKey,
    queryFn: () => client.schedule.destinations(),
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateScheduleInput) => client.schedule.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulesKey }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...patch }: UpdateScheduleInput & { id: string }) =>
      client.schedule.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulesKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.schedule.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulesKey }),
  })

  const create = useCallback(
    (input: CreateScheduleInput) => createMutation.mutateAsync(input),
    [createMutation],
  )
  const update = useCallback(
    (input: UpdateScheduleInput & { id: string }) => updateMutation.mutateAsync(input),
    [updateMutation],
  )
  const remove = useCallback((id: string) => deleteMutation.mutateAsync(id), [deleteMutation])

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    destinations,
    create,
    update,
    remove,
  }
}
