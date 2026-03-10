'use client'

import { Loader2Icon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { TaskDialog } from '@/components/schedules/task-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfig } from '@/hooks/use-config'
import { type ScheduleTask, useDeleteSchedule, useSchedules } from '@/hooks/use-schedules'
import { formatInTimezone } from '@/lib/timezone'

export function TaskList() {
  const { data: config } = useConfig()
  const timezone = config?.timezone ?? 'UTC'
  const { data, isLoading, error } = useSchedules()
  const deleteSchedule = useDeleteSchedule()
  const [editTask, setEditTask] = useState<ScheduleTask | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null)

  const fmt: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-destructive text-sm">Failed to load schedules: {error.message}</p>
  }

  const tasks = data?.tasks ?? []

  if (tasks.length === 0) {
    return <p className="text-muted-foreground text-sm">No scheduled tasks yet.</p>
  }

  function formatNextRun(iso: string | null) {
    if (!iso) return 'Not scheduled'
    return formatInTimezone(iso, timezone, fmt)
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-sm">{task.name}</span>
                <Badge variant="outline">{task.cron ? 'Recurring' : 'One-time'}</Badge>
                {task.enabled ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
                {task.isRunning && <Badge>Running</Badge>}
              </div>
              <div className="flex gap-4 text-muted-foreground text-xs">
                <span>
                  {task.cron ? (
                    <code>{task.cron}</code>
                  ) : (
                    <>Run at: {formatInTimezone(task.runAt ?? '', timezone, fmt)}</>
                  )}
                </span>
                <span>Next: {formatNextRun(task.nextRun)}</span>
                {task.maxRuns && <span>Max runs: {task.maxRuns}</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditTask(task)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(task)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <TaskDialog
        task={editTask}
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(undefined)}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete schedule?</DialogTitle>
            <DialogDescription>
              This will permanently delete the scheduled task &quot;{deleteTarget?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSchedule.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteSchedule.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  })
                }
              }}
            >
              {deleteSchedule.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
