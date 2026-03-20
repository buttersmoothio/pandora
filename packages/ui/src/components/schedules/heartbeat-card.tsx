'use client'

import type { HeartbeatCheck } from '@pandorakit/sdk/client'
import { Loader2Icon, PlusIcon, XIcon } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { useConfig } from '@/hooks/use-config'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { useSchedules } from '@/hooks/use-schedules'

export function HeartbeatCard(): React.JSX.Element {
  const { data: heartbeat, isLoading, update: updateHeartbeat, isUpdating } = useHeartbeat()
  const { destinations: destinationsQuery } = useSchedules()
  const { data: destinationsData } = destinationsQuery
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

  function save(patch: Record<string, unknown>): void {
    updateHeartbeat(patch).catch((err: Error) =>
      toast.error(`Failed to update heartbeat: ${err.message}`),
    )
  }

  function addTask(): void {
    if (!newTaskDescription.trim()) {
      return
    }
    const updated = [
      ...tasks,
      { id: crypto.randomUUID(), description: newTaskDescription.trim(), enabled: true },
    ]
    setTasks(updated)
    setNewTaskDescription('')
    save({ tasks: updated })
  }

  function removeTask(id: string): void {
    const updated = tasks.filter((t) => t.id !== id)
    setTasks(updated)
    save({ tasks: updated })
  }

  function toggleTask(id: string): void {
    const updated = tasks.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    setTasks(updated)
    save({ tasks: updated })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="display-heading-medium font-display text-base">Heartbeat</h2>
            {heartbeat?.isRunning && <Badge>Running</Badge>}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            Periodic awareness checks. The agent evaluates a checklist and only notifies you when
            something needs attention.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={isUpdating}
          onCheckedChange={(checked: boolean): void => save({ enabled: checked })}
        />
      </div>

      {enabled && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="heartbeat-cron">Interval ({timezone})</Label>
            <Input
              id="heartbeat-cron"
              placeholder="*/30 * * * *"
              value={cron}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setCron(e.target.value)}
              onBlur={(): void => {
                if (cron.trim()) {
                  save({ cron: cron.trim() })
                }
              }}
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
                    onCheckedChange={(): void => toggleTask(task.id)}
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
                    onClick={(): void => removeTask(task.id)}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                  setNewTaskDescription(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>): void => {
                  if (e.key === 'Enter') {
                    addTask()
                  }
                }}
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
              onValueChange={(value: string): void => {
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
                {destinationsData?.data.map((dest) => (
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
                onCheckedChange={(checked: boolean): void => {
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                    setActiveStart(e.target.value)
                  }
                  onBlur={(): void => save({ activeHours: { start: activeStart, end: activeEnd } })}
                  className="w-28"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="time"
                  value={activeEnd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                    setActiveEnd(e.target.value)
                  }
                  onBlur={(): void => save({ activeHours: { start: activeStart, end: activeEnd } })}
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
        </div>
      )}
    </div>
  )
}
