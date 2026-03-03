import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

export interface ScheduleTask {
  id: string
  name: string
  cron: string
  prompt: string
  enabled: boolean
  timezone?: string
  maxRuns?: number
  nextRun: string | null
  isRunning: boolean
}

interface ScheduleListResponse {
  enabled: boolean
  tasks: ScheduleTask[]
}

interface CreateScheduleInput {
  name: string
  cron: string
  prompt: string
  enabled?: boolean
  timezone?: string
  maxRuns?: number
}

interface UpdateScheduleInput {
  id: string
  name?: string
  cron?: string
  prompt?: string
  enabled?: boolean
  timezone?: string | null
  maxRuns?: number | null
}

const SCHEDULES_KEY = ['schedules'] as const

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
      toast.success('Schedule created')
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
      toast.success('Schedule updated')
    },
    onError: (err: Error) => {
      toast.error(`Failed to update schedule: ${err.message}`)
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
      toast.success('Schedule deleted')
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete schedule: ${err.message}`)
    },
  })
}
