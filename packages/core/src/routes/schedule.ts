import { Hono } from 'hono'
import { z } from 'zod'
import type { HeartbeatCheck, ScheduledTask } from '../config'
import { applyTaskPatch, HeartbeatCheckSchema, updateConfig } from '../config'
import { getLogger } from '../logger'
import { HEARTBEAT_TASK_ID } from '../scheduler/heartbeat'
import type { Env } from './helpers'

const CreateTaskSchema: z.ZodType<{
  name: string
  cron?: string
  runAt?: string
  prompt: string
  enabled: boolean
  timezone?: string
  maxRuns?: number
  destination?: string
}> = z
  .object({
    name: z.string().min(1),
    cron: z.string().min(1).optional(),
    runAt: z.string().optional(),
    prompt: z.string().min(1),
    enabled: z.boolean().default(true),
    timezone: z.string().optional(),
    maxRuns: z.number().int().positive().optional(),
    destination: z.string().optional(),
  })
  .refine((d) => (d.cron != null) !== (d.runAt != null), {
    message: 'Exactly one of "cron" or "runAt" is required',
  })

const UpdateTaskSchema: z.ZodType<{
  name?: string
  cron?: string | null
  runAt?: string | null
  prompt?: string
  enabled?: boolean
  timezone?: string | null
  maxRuns?: number | null
  destination?: string | null
}> = z.object({
  name: z.string().min(1).optional(),
  cron: z.string().min(1).optional().nullable(),
  runAt: z.string().optional().nullable(),
  prompt: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  timezone: z.string().optional().nullable(),
  maxRuns: z.number().int().positive().optional().nullable(),
  destination: z.string().optional().nullable(),
})

const scheduleRoutes: Hono<Env> = new Hono<Env>()

// List available notification destinations
scheduleRoutes.get('/destinations', (c) => {
  const { channels, channelNames } = c.var.runtime
  const destinations: string[] = ['Web Inbox']
  for (const [friendlyName, nsKey] of channelNames) {
    const channel = channels.get(nsKey)
    if (channel?.notify) {
      destinations.push(friendlyName)
    }
  }
  return c.json({ destinations })
})

// List all tasks
scheduleRoutes.get('/', (c) => {
  const runtime = c.var.runtime
  const tasks = runtime.config.schedule.tasks.map((task) => ({
    ...task,
    nextRun: runtime.scheduler.nextRun(task.id)?.toISOString() ?? null,
    isRunning: runtime.scheduler.isRunning(task.id),
  }))
  return c.json({ enabled: runtime.config.schedule.enabled, tasks })
})

// -- Heartbeat --

const HeartbeatUpdateSchema: z.ZodType<{
  enabled?: boolean
  cron?: string
  tasks?: HeartbeatCheck[]
  destination?: string | null
  activeHours?: { start: string; end: string } | null
}> = z.object({
  enabled: z.boolean().optional(),
  cron: z.string().min(1).optional(),
  tasks: z.array(HeartbeatCheckSchema).optional(),
  destination: z.string().optional().nullable(),
  activeHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional()
    .nullable(),
})

scheduleRoutes.get('/heartbeat', (c) => {
  const runtime = c.var.runtime
  const heartbeat = runtime.config.schedule.heartbeat
  return c.json({
    ...heartbeat,
    nextRun: heartbeat.enabled
      ? (runtime.scheduler.nextRun(HEARTBEAT_TASK_ID)?.toISOString() ?? null)
      : null,
    isRunning: runtime.scheduler.isRunning(HEARTBEAT_TASK_ID),
  })
})

scheduleRoutes.patch('/heartbeat', async (c) => {
  const log = getLogger()
  try {
    const body = await c.req.json()
    const patch = HeartbeatUpdateSchema.parse(body)
    const runtime = c.var.runtime

    const current = runtime.config.schedule.heartbeat
    // Build a patch object where `null` values signal deletion to deepMerge
    // biome-ignore lint/suspicious/noExplicitAny: null signals deletion in deepMerge
    const heartbeatPatch: Record<string, any> = { ...current }

    if (patch.enabled !== undefined) {
      heartbeatPatch.enabled = patch.enabled
    }
    if (patch.cron !== undefined) {
      heartbeatPatch.cron = patch.cron
    }
    if (patch.tasks !== undefined) {
      heartbeatPatch.tasks = patch.tasks
    }
    if (patch.destination === null) {
      heartbeatPatch.destination = null
    } else if (patch.destination !== undefined) {
      heartbeatPatch.destination = patch.destination
    }
    if (patch.activeHours === null) {
      heartbeatPatch.activeHours = null
    } else if (patch.activeHours !== undefined) {
      heartbeatPatch.activeHours = patch.activeHours
    }

    const config = await updateConfig(
      runtime.storage.config,
      // biome-ignore lint/suspicious/noExplicitAny: heartbeatPatch uses null for deepMerge deletion
      { schedule: { ...runtime.config.schedule, heartbeat: heartbeatPatch } } as any,
      runtime.registry,
    )
    runtime.config = config
    runtime.syncSchedule()

    return c.json(config.schedule.heartbeat)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      return c.json({ error: messages.join(', ') }, 400)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Heartbeat update failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Get single task
scheduleRoutes.get('/:id', (c) => {
  const runtime = c.var.runtime
  const task = runtime.config.schedule.tasks.find((t) => t.id === c.req.param('id'))
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  return c.json({
    ...task,
    nextRun: runtime.scheduler.nextRun(task.id)?.toISOString() ?? null,
    isRunning: runtime.scheduler.isRunning(task.id),
  })
})

// Create task
scheduleRoutes.post('/', async (c) => {
  const log = getLogger()
  try {
    const body = await c.req.json()
    const parsed = CreateTaskSchema.parse(body)
    const runtime = c.var.runtime

    const task: ScheduledTask = { id: crypto.randomUUID(), ...parsed }
    const tasks = [...runtime.config.schedule.tasks, task]

    const config = await updateConfig(
      runtime.storage.config,
      { schedule: { ...runtime.config.schedule, tasks } },
      runtime.registry,
    )
    runtime.config = config
    runtime.syncSchedule()

    return c.json(task, 201)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      return c.json({ error: messages.join(', ') }, 400)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Schedule create failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Update task
scheduleRoutes.patch('/:id', async (c) => {
  const log = getLogger()
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const patch = UpdateTaskSchema.parse(body)
    const runtime = c.var.runtime

    let found = false
    const tasks = runtime.config.schedule.tasks.map((t) => {
      if (t.id !== id) {
        return t
      }
      found = true
      return applyTaskPatch(t, patch)
    })

    if (!found) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const config = await updateConfig(
      runtime.storage.config,
      { schedule: { ...runtime.config.schedule, tasks } },
      runtime.registry,
    )
    runtime.config = config
    runtime.syncSchedule()

    return c.json(tasks.find((t) => t.id === id))
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      return c.json({ error: messages.join(', ') }, 400)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Schedule update failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Delete task
scheduleRoutes.delete('/:id', async (c) => {
  const log = getLogger()
  try {
    const id = c.req.param('id')
    const runtime = c.var.runtime

    const before = runtime.config.schedule.tasks.length
    const tasks = runtime.config.schedule.tasks.filter((t) => t.id !== id)
    if (tasks.length === before) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const config = await updateConfig(
      runtime.storage.config,
      { schedule: { ...runtime.config.schedule, tasks } },
      runtime.registry,
    )
    runtime.config = config
    runtime.syncSchedule()

    return c.json({ deleted: id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Schedule delete failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

export { scheduleRoutes }
