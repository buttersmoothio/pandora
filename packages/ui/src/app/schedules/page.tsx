'use client'

import { Loader2Icon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'

/** Format a UTC ISO string as a datetime-local value in the given timezone. */
function utcToLocalInput(iso: string, timeZone: string): string {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  // en-CA formats hour 00 as "24" at midnight — normalize
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/** Convert a datetime-local value (in the given timezone) to a UTC ISO string. */
function localInputToUtc(local: string, timeZone: string): string {
  // Parse the user's intended date/time parts
  const [datePart, timePart] = local.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  // Start by treating the input as UTC to get a baseline
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute))

  // Format that UTC time in the target timezone to find the offset
  const inTz = utcToLocalInput(asUtc.toISOString(), timeZone)
  const [tzDate, tzTime] = inTz.split('T')
  const [ty, tm, td] = tzDate.split('-').map(Number)
  const [th, tmin] = tzTime.split(':').map(Number)
  const tzAsUtc = new Date(Date.UTC(ty, tm - 1, td, th, tmin))

  const offsetMs = tzAsUtc.getTime() - asUtc.getTime()
  return new Date(asUtc.getTime() - offsetMs).toISOString()
}

/** Format a UTC ISO string for display in the given timezone. */
function formatInTimezone(
  iso: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(iso).toLocaleString(undefined, { timeZone, ...options })
}

import {
  type HeartbeatCheck,
  type ScheduleTask,
  useCreateSchedule,
  useDeleteSchedule,
  useDestinations,
  useHeartbeat,
  useSchedules,
  useUpdateHeartbeat,
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

function HeartbeatCard() {
  const { data: heartbeat, isLoading } = useHeartbeat()
  const updateHeartbeat = useUpdateHeartbeat()
  const { data: destinationsData } = useDestinations()
  const { data: config } = useConfig()
  const timezone = config?.timezone ?? 'UTC'

  const [cron, setCron] = useState('')
  const [destination, setDestination] = useState('')
  const [activeHoursEnabled, setActiveHoursEnabled] = useState(false)
  const [activeStart, setActiveStart] = useState('08:00')
  const [activeEnd, setActiveEnd] = useState('22:00')
  const [tasks, setTasks] = useState<HeartbeatCheck[]>([])
  const [newTaskDescription, setNewTaskDescription] = useState('')

  useEffect(() => {
    if (heartbeat) {
      setCron(heartbeat.cron)
      setDestination(heartbeat.destination ?? '')
      setActiveHoursEnabled(!!heartbeat.activeHours)
      setActiveStart(heartbeat.activeHours?.start ?? '08:00')
      setActiveEnd(heartbeat.activeHours?.end ?? '22:00')
      setTasks(heartbeat.tasks)
    }
  }, [heartbeat])

  const enabled = heartbeat?.enabled ?? false

  function save(patch: Record<string, unknown>) {
    updateHeartbeat.mutate(patch)
  }

  function addTask() {
    if (!newTaskDescription.trim()) return
    const updated = [
      ...tasks,
      { id: crypto.randomUUID(), description: newTaskDescription.trim(), enabled: true },
    ]
    setTasks(updated)
    setNewTaskDescription('')
    save({ tasks: updated })
  }

  function removeTask(id: string) {
    const updated = tasks.filter((t) => t.id !== id)
    setTasks(updated)
    save({ tasks: updated })
  }

  function toggleTask(id: string) {
    const updated = tasks.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    setTasks(updated)
    save({ tasks: updated })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-center py-4">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <CardTitle>Heartbeat</CardTitle>
              {heartbeat?.isRunning && <Badge>Running</Badge>}
            </div>
            <CardDescription>
              Periodic awareness checks. The agent evaluates a checklist and only notifies you when
              something needs attention.
            </CardDescription>
          </div>
          <Switch
            checked={enabled}
            disabled={updateHeartbeat.isPending}
            onCheckedChange={(checked) => save({ enabled: checked })}
          />
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="heartbeat-cron">Interval ({timezone})</Label>
            <Input
              id="heartbeat-cron"
              placeholder="*/30 * * * *"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              onBlur={() => cron.trim() && save({ cron: cron.trim() })}
            />
            <p className="text-muted-foreground text-xs">
              Cron expression. Examples: <code>*/30 * * * *</code> (every 30 min),{' '}
              <code>0 * * * *</code> (every hour)
            </p>
            {heartbeat?.nextRun && (
              <p className="text-muted-foreground text-xs">
                Next run:{' '}
                {new Date(heartbeat.nextRun).toLocaleString(undefined, { timeZone: timezone })}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Checklist</Label>
            {tasks.length > 0 && !tasks.some((t) => t.enabled) && (
              <p className="text-destructive text-xs">
                All checks are disabled. The heartbeat will be skipped until at least one is
                enabled.
              </p>
            )}
            {tasks.length === 0 && (
              <p className="text-muted-foreground text-xs">
                No checks yet. Add at least one for the heartbeat to run.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <Switch
                    checked={task.enabled}
                    onCheckedChange={() => toggleTask(task.id)}
                    className="shrink-0"
                  />
                  <span
                    className={`flex-1 text-sm ${task.enabled ? '' : 'text-muted-foreground line-through'}`}
                  >
                    {task.description}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeTask(task.id)}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a check (e.g. 'Scan inbox for urgent emails')"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addTask}
                disabled={!newTaskDescription.trim()}
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="heartbeat-destination">Notify Via</Label>
            <Select
              value={destination}
              onValueChange={(value) => {
                const dest = value === 'none' ? '' : value
                setDestination(dest)
                save({ destination: dest || null })
              }}
            >
              <SelectTrigger id="heartbeat-destination">
                <SelectValue placeholder="No notification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No notification</SelectItem>
                {destinationsData?.destinations.map((dest) => (
                  <SelectItem key={dest} value={dest}>
                    {dest}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Where to send alerts when the heartbeat finds something important.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="heartbeat-active-hours"
                checked={activeHoursEnabled}
                onCheckedChange={(checked) => {
                  setActiveHoursEnabled(checked)
                  if (checked) {
                    save({ activeHours: { start: activeStart, end: activeEnd } })
                  } else {
                    save({ activeHours: null })
                  }
                }}
              />
              <Label htmlFor="heartbeat-active-hours">Active Hours</Label>
            </div>
            {activeHoursEnabled && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={activeStart}
                  onChange={(e) => setActiveStart(e.target.value)}
                  onBlur={() => save({ activeHours: { start: activeStart, end: activeEnd } })}
                  className="w-28"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="time"
                  value={activeEnd}
                  onChange={(e) => setActiveEnd(e.target.value)}
                  onBlur={() => save({ activeHours: { start: activeStart, end: activeEnd } })}
                  className="w-28"
                />
                <span className="text-muted-foreground text-xs">({timezone})</span>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Restrict heartbeat checks to specific hours. Outside this window, heartbeats are
              skipped.
            </p>
          </div>
        </CardContent>
      )}
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
  maxRuns: string
  destination: string
}

const EMPTY_FORM: TaskFormState = {
  mode: 'cron',
  name: '',
  cron: '',
  runAt: '',
  prompt: '',
  enabled: true,
  maxRuns: '',
  destination: '',
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
  const { data: config } = useConfig()
  const timezone = config?.timezone ?? 'UTC'
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const { data: destinationsData } = useDestinations()
  const isEdit = !!task

  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM)

  useEffect(() => {
    if (task) {
      setForm({
        mode: task.runAt ? 'runAt' : 'cron',
        name: task.name,
        cron: task.cron ?? '',
        runAt: task.runAt ? utcToLocalInput(task.runAt, timezone) : '',
        prompt: task.prompt,
        enabled: task.enabled,
        maxRuns: task.maxRuns?.toString() ?? '',
        destination: task.destination ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [task, timezone])

  const isPending = createSchedule.isPending || updateSchedule.isPending

  function handleSave() {
    const payload = {
      name: form.name,
      ...(form.mode === 'cron'
        ? { cron: form.cron }
        : { runAt: localInputToUtc(form.runAt, timezone) }),
      prompt: form.prompt,
      enabled: form.enabled,
      ...(form.mode === 'cron' && form.maxRuns
        ? { maxRuns: Number.parseInt(form.maxRuns, 10) }
        : {}),
      ...(form.destination ? { destination: form.destination } : {}),
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
              <Label htmlFor="schedule-cron">Cron Expression ({timezone})</Label>
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
              <Label htmlFor="schedule-runat">Run At ({timezone})</Label>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-destination">Notify Via</Label>
            <Select
              value={form.destination}
              onValueChange={(value) =>
                setForm({ ...form, destination: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger id="schedule-destination">
                <SelectValue placeholder="No notification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No notification</SelectItem>
                {destinationsData?.destinations.map((dest) => (
                  <SelectItem key={dest} value={dest}>
                    {dest}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Where to send the task results. Leave empty to skip notifications.
            </p>
          </div>

          {form.mode === 'cron' && (
            <div className="flex flex-col gap-2">
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

export default function SchedulesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: config } = useConfig()
  const schedulingEnabled = config?.schedule.enabled ?? false

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

      {schedulingEnabled && <HeartbeatCard />}

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
