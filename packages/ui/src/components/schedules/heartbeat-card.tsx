'use client'

import { Loader2Icon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  type HeartbeatCheck,
  useDestinations,
  useHeartbeat,
  useUpdateHeartbeat,
} from '@/hooks/use-schedules'

export function HeartbeatCard() {
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
