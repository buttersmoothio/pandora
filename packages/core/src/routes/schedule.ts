import { Hono } from 'hono'
import { z } from 'zod'
import type { ScheduledTask } from '../config'
import { updateConfig } from '../config'
import { getLogger } from '../logger'
import type { Env } from './helpers'

const CreateTaskSchema = z
  .object({
    name: z.string().min(1),
    cron: z.string().min(1).optional(),
    runAt: z.string().optional(),
    prompt: z.string().min(1),
    enabled: z.boolean().default(true),
    timezone: z.string().optional(),
    maxRuns: z.number().int().positive().optional(),
  })
  .refine((d) => (d.cron != null) !== (d.runAt != null), {
    message: 'Exactly one of "cron" or "runAt" is required',
  })

const UpdateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  cron: z.string().min(1).optional().nullable(),
  runAt: z.string().optional().nullable(),
  prompt: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  timezone: z.string().optional().nullable(),
  maxRuns: z.number().int().positive().optional().nullable(),
})

function applyTaskPatch(task: ScheduledTask, patch: Record<string, unknown>): ScheduledTask {
  const updated = { ...task, ...patch } as Record<string, unknown>
  // Mutual exclusion: setting runAt clears cron and vice versa
  if (patch.runAt !== undefined && patch.runAt !== null) delete updated.cron
  if (patch.cron !== undefined && patch.cron !== null) delete updated.runAt
  // null means clear optional fields
  for (const key of ['timezone', 'maxRuns', 'cron', 'runAt']) {
    if (patch[key] === null) delete updated[key]
  }
  return updated as ScheduledTask
}

const scheduleRoutes = new Hono<Env>()

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

// Get single task
scheduleRoutes.get('/:id', (c) => {
  const runtime = c.var.runtime
  const task = runtime.config.schedule.tasks.find((t) => t.id === c.req.param('id'))
  if (!task) return c.json({ error: 'Task not found' }, 404)

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
      { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
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
      if (t.id !== id) return t
      found = true
      return applyTaskPatch(t, patch as Record<string, unknown>)
    })

    if (!found) return c.json({ error: 'Task not found' }, 404)

    const config = await updateConfig(
      runtime.storage.config,
      { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
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
    if (tasks.length === before) return c.json({ error: 'Task not found' }, 404)

    const config = await updateConfig(
      runtime.storage.config,
      { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
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
