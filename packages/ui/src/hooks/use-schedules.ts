import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '@/lib/api'

export type {
  CreateScheduleInput,
  HeartbeatCheck,
  HeartbeatConfig,
  ScheduleTask,
  UpdateScheduleInput,
} from '@pandorakit/sdk/client'

import type {
  CreateScheduleInput,
  HeartbeatConfig,
  ScheduleTask,
  UpdateScheduleInput,
} from '@pandorakit/sdk/client'

interface ScheduleListResponse {
  enabled: boolean
  tasks: ScheduleTask[]
}

const SCHEDULES_KEY = ['schedules'] as const
const DESTINATIONS_KEY = ['schedule-destinations'] as const
const HEARTBEAT_KEY = ['schedule-heartbeat'] as const

export function useDestinations(): UseQueryResult<{ destinations: string[] }> {
  return useQuery({
    queryKey: DESTINATIONS_KEY,
    queryFn: () => client.schedule.destinations(),
  })
}

export function useSchedules(): UseQueryResult<ScheduleListResponse> {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: () => client.schedule.list(),
  })
}

export function useCreateSchedule(): UseMutationResult<ScheduleTask, Error, CreateScheduleInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateScheduleInput) => client.schedule.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to create schedule: ${err.message}`)
    },
  })
}

export function useUpdateSchedule(): UseMutationResult<
  ScheduleTask,
  Error,
  UpdateScheduleInput & { id: string }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateScheduleInput & { id: string }) =>
      client.schedule.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update schedule: ${err.message}`)
    },
  })
}

export function useHeartbeat(): UseQueryResult<HeartbeatConfig> {
  return useQuery({
    queryKey: HEARTBEAT_KEY,
    queryFn: () => client.schedule.heartbeat(),
  })
}

export function useUpdateHeartbeat(): UseMutationResult<
  HeartbeatConfig,
  Error,
  Partial<HeartbeatConfig>
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch: Partial<HeartbeatConfig>) => client.schedule.updateHeartbeat(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEARTBEAT_KEY })
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update heartbeat: ${err.message}`)
    },
  })
}

export function useDeleteSchedule(): UseMutationResult<{ deleted: string }, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => client.schedule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete schedule: ${err.message}`)
    },
  })
}
