'use client'

import { Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'
import {
  type ScheduleTask,
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useUpdateSchedule,
} from '@/hooks/use-schedules'

function MasterToggle() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
  const enabled = config?.schedule.enabled ?? false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Scheduling</CardTitle>
            <CardDescription>
              {enabled
                ? 'Scheduled tasks are active and will run on their configured schedule.'
                : 'Scheduling is disabled. Tasks will not run until enabled.'}
            </CardDescription>
          </div>
          <Switch
            checked={enabled}
            disabled={updateConfig.isPending}
            onCheckedChange={(checked) =>
              updateConfig.mutate({
                schedule: { enabled: checked, tasks: config?.schedule.tasks ?? [] },
              })
            }
          />
        </div>
      </CardHeader>
    </Card>
  )
}

interface TaskFormState {
  mode: 'cron' | 'runAt'
  name: string
  cron: string
  runAt: string
  prompt: string
  enabled: boolean
  timezone: string
  maxRuns: string
}

const EMPTY_FORM: TaskFormState = {
  mode: 'cron',
  name: '',
  cron: '',
  runAt: '',
  prompt: '',
  enabled: true,
  timezone: '',
  maxRuns: '',
}

function TaskDialog({
  task,
  open,
  onOpenChange,
}: {
  task?: ScheduleTask
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const isEdit = !!task

  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM)

  useEffect(() => {
    if (task) {
      setForm({
        mode: task.runAt ? 'runAt' : 'cron',
        name: task.name,
        cron: task.cron ?? '',
        runAt: task.runAt ? new Date(task.runAt).toISOString().slice(0, 16) : '',
        prompt: task.prompt,
        enabled: task.enabled,
        timezone: task.timezone ?? '',
        maxRuns: task.maxRuns?.toString() ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [task])

  const isPending = createSchedule.isPending || updateSchedule.isPending

  function handleSave() {
    const payload = {
      name: form.name,
      ...(form.mode === 'cron'
        ? { cron: form.cron }
        : { runAt: new Date(form.runAt).toISOString() }),
      prompt: form.prompt,
      enabled: form.enabled,
      ...(form.timezone ? { timezone: form.timezone } : {}),
      ...(form.mode === 'cron' && form.maxRuns
        ? { maxRuns: Number.parseInt(form.maxRuns, 10) }
        : {}),
    }

    if (isEdit) {
      updateSchedule.mutate({ id: task.id, ...payload }, { onSuccess: () => onOpenChange(false) })
    } else {
      createSchedule.mutate(payload, { onSuccess: () => onOpenChange(false) })
    }
  }

  const canSave =
    form.name.trim() &&
    form.prompt.trim() &&
    (form.mode === 'cron' ? form.cron.trim() : form.runAt.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the scheduled task configuration.'
              : 'Create a new scheduled task — recurring or one-time.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-name">Name</Label>
            <Input
              id="schedule-name"
              placeholder="Morning email check"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <ButtonGroup>
              <Button
                variant={form.mode === 'cron' ? 'default' : 'outline'}
                size="sm"
                type="button"
                onClick={() => setForm({ ...form, mode: 'cron' })}
              >
                Recurring
              </Button>
              <Button
                variant={form.mode === 'runAt' ? 'default' : 'outline'}
                size="sm"
                type="button"
                onClick={() => setForm({ ...form, mode: 'runAt' })}
              >
                One-time
              </Button>
            </ButtonGroup>
          </div>

          {form.mode === 'cron' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule-cron">Cron Expression</Label>
              <Input
                id="schedule-cron"
                placeholder="0 8 * * *"
                value={form.cron}
                onChange={(e) => setForm({ ...form, cron: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                Examples: <code>0 8 * * *</code> (daily 8am), <code>*/30 * * * *</code> (every 30
                min), <code>0 9 * * 1</code> (Mondays 9am)
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule-runat">Run At</Label>
              <Input
                id="schedule-runat"
                type="datetime-local"
                value={form.runAt}
                onChange={(e) => setForm({ ...form, runAt: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                The task will run once at this date and time.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-prompt">Prompt</Label>
            <Textarea
              id="schedule-prompt"
              placeholder="Check my emails and summarize anything important."
              rows={3}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          </div>

          <div className="flex gap-4">
            {form.mode === 'cron' && (
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="schedule-maxruns">Max Runs</Label>
                <Input
                  id="schedule-maxruns"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={form.maxRuns}
                  onChange={(e) => setForm({ ...form, maxRuns: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">Leave empty for recurring forever.</p>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="schedule-timezone">Timezone</Label>
              <Input
                id="schedule-timezone"
                placeholder="America/New_York"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="schedule-enabled"
              checked={form.enabled}
              onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
            />
            <Label htmlFor="schedule-enabled">Enabled</Label>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={isPending || !canSave} onClick={handleSave}>
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : isEdit ? (
              'Save'
            ) : (
              'Create'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TaskList() {
  const { data, isLoading, error } = useSchedules()
  const deleteSchedule = useDeleteSchedule()
  const [editTask, setEditTask] = useState<ScheduleTask | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null)

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
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
                    <>
                      Run at:{' '}
                      {new Date(task.runAt ?? '').toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </>
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

export default function SchedulesPage() {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">Schedules</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="mr-1 size-4" />
          New Schedule
        </Button>
      </div>

      <MasterToggle />

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Tasks</CardTitle>
          <CardDescription>
            Tasks that run automatically on a schedule. Recurring tasks use cron expressions;
            one-time tasks run at a specific date and time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskList />
        </CardContent>
      </Card>

      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
