'use client'

import { Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
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
import { useConfig } from '@/hooks/use-config'
import {
  type ScheduleTask,
  useCreateSchedule,
  useDestinations,
  useUpdateSchedule,
} from '@/hooks/use-schedules'
import { localInputToUtc, utcToLocalInput } from '@/lib/timezone'

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

export function TaskDialog({
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
