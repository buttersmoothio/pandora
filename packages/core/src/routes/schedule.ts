import { Hono } from 'hono'
import { z } from 'zod'
import type { ScheduledTask } from '../config'
import { ScheduledTaskSchema, updateConfig } from '../config'
import { getLogger } from '../logger'
import type { Env } from './helpers'

const CreateTaskSchema = ScheduledTaskSchema.omit({ id: true })

const UpdateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  cron: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  timezone: z.string().optional().nullable(),
  maxRuns: z.number().int().positive().optional().nullable(),
})

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
      const updated = { ...t, ...patch }
      // null means clear optional fields
      if (patch.timezone === null) delete (updated as Record<string, unknown>).timezone
      if (patch.maxRuns === null) delete (updated as Record<string, unknown>).maxRuns
      return updated as ScheduledTask
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
