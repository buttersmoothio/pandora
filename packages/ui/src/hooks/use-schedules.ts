import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

export interface ScheduleTask {
  id: string
  name: string
  cron?: string
  runAt?: string
  prompt: string
  enabled: boolean
  maxRuns?: number
  destination?: string
  nextRun: string | null
  isRunning: boolean
}

interface ScheduleListResponse {
  enabled: boolean
  tasks: ScheduleTask[]
}

interface CreateScheduleInput {
  name: string
  cron?: string
  runAt?: string
  prompt: string
  enabled?: boolean
  maxRuns?: number
  destination?: string
}

interface UpdateScheduleInput {
  id: string
  name?: string
  cron?: string | null
  runAt?: string | null
  prompt?: string
  enabled?: boolean
  maxRuns?: number | null
  destination?: string | null
}

export interface HeartbeatCheck {
  id: string
  description: string
  enabled: boolean
}

export interface HeartbeatConfig {
  enabled: boolean
  cron: string
  tasks: HeartbeatCheck[]
  destination?: string
  activeHours?: { start: string; end: string }
  nextRun: string | null
  isRunning: boolean
}

const SCHEDULES_KEY = ['schedules'] as const
const DESTINATIONS_KEY = ['schedule-destinations'] as const
const HEARTBEAT_KEY = ['schedule-heartbeat'] as const

export function useDestinations() {
  return useQuery({
    queryKey: DESTINATIONS_KEY,
    queryFn: () => apiFetch<{ destinations: string[] }>('/api/schedule/destinations'),
  })
}

export function useSchedules() {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: () => apiFetch<ScheduleListResponse>('/api/schedule'),
  })
}

export function useCreateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      apiFetch<ScheduleTask>('/api/schedule', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to create schedule: ${err.message}`)
    },
  })
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateScheduleInput) =>
      apiFetch<ScheduleTask>(`/api/schedule/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update schedule: ${err.message}`)
    },
  })
}

export function useHeartbeat() {
  return useQuery({
    queryKey: HEARTBEAT_KEY,
    queryFn: () => apiFetch<HeartbeatConfig>('/api/schedule/heartbeat'),
  })
}

export function useUpdateHeartbeat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (patch: Partial<HeartbeatConfig>) =>
      apiFetch<HeartbeatConfig>('/api/schedule/heartbeat', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEARTBEAT_KEY })
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update heartbeat: ${err.message}`)
    },
  })
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: string }>(`/api/schedule/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete schedule: ${err.message}`)
    },
  })
}
