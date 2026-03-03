import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { applyTaskPatch, type Config, type ScheduledTask, updateConfig } from '../config'
import type { PandoraRuntime } from '../runtime/pandora-runtime'
import type { PluginRegistry } from '../runtime/plugin-registry'
import type { ConfigStore } from '../storage/config-store'
import type { ToolRecord } from '../tools/types'

export interface ScheduleToolDeps {
  configStore: ConfigStore<Config>
  registry: PluginRegistry
  runtimeRef: { current: PandoraRuntime | null }
}

export function createScheduleTools(deps: ScheduleToolDeps): ToolRecord {
  const { configStore, registry, runtimeRef } = deps

  const list_schedules = createTool({
    id: 'list_schedules',
    description: 'List all scheduled tasks with their next run time',
    inputSchema: z.object({}),
    execute: async () => {
      const runtime = runtimeRef.current
      if (!runtime) return { tasks: [] }

      const tasks = runtime.config.schedule.tasks.map((task) => ({
        ...task,
        nextRun: runtime.scheduler?.nextRun(task.id)?.toISOString() ?? null,
        isRunning: runtime.scheduler?.isRunning(task.id) ?? false,
      }))
      return { enabled: runtime.config.schedule.enabled, tasks }
    },
  })

  const createTask = async (input: Omit<ScheduledTask, 'id'>) => {
    const runtime = runtimeRef.current
    if (!runtime) return { error: 'Runtime not available' }

    const task: ScheduledTask = { id: crypto.randomUUID(), ...input }
    const tasks = [...runtime.config.schedule.tasks, task]
    const config = await updateConfig(
      configStore,
      { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
      registry,
    )
    runtime.config = config
    runtime.syncSchedule()

    return { created: task }
  }

  const schedule_task = createTool({
    id: 'schedule_task',
    description:
      'Schedule a one-time task to run at a specific date and time. Use this for reminders, one-off reports, delayed actions, etc.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Human-readable task name'),
      runAt: z
        .string()
        .describe('ISO 8601 datetime for when the task should run (e.g. "2026-03-15T09:00:00Z")'),
      prompt: z.string().min(1).describe('The prompt the agent will execute when the task runs'),
      enabled: z.boolean().default(true).describe('Whether the task is active'),
      timezone: z.string().optional().describe('IANA timezone (e.g. "America/New_York")'),
      destination: z.string().optional().describe('Notification destination'),
    }),
    execute: async (input) => createTask(input),
  })

  const schedule_recurring = createTool({
    id: 'schedule_recurring',
    description:
      'Create a recurring scheduled task using a cron expression. Use this for daily digests, periodic reports, repeated checks, etc.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Human-readable task name'),
      cron: z
        .string()
        .min(1)
        .describe(
          'Cron expression (e.g. "0 8 * * *" for daily at 8am, "0 */6 * * *" for every 6 hours)',
        ),
      prompt: z.string().min(1).describe('The prompt the agent will execute on each run'),
      enabled: z.boolean().default(true).describe('Whether the task is active'),
      timezone: z.string().optional().describe('IANA timezone (e.g. "America/New_York")'),
      maxRuns: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max number of runs (omit to run forever)'),
      destination: z.string().optional().describe('Notification destination'),
    }),
    execute: async (input) => createTask(input),
  })

  const update_schedule = createTool({
    id: 'update_schedule',
    description: 'Update an existing scheduled task by ID',
    inputSchema: z.object({
      id: z.string().uuid().describe('Task ID to update'),
      name: z.string().min(1).optional().describe('New task name'),
      cron: z.string().min(1).optional().nullable().describe('New cron expression (null to clear)'),
      runAt: z.string().optional().nullable().describe('ISO 8601 datetime (null to clear)'),
      prompt: z.string().min(1).optional().describe('New prompt'),
      enabled: z.boolean().optional().describe('Enable or disable the task'),
      timezone: z.string().optional().nullable().describe('New timezone (null to clear)'),
      maxRuns: z
        .number()
        .int()
        .positive()
        .optional()
        .nullable()
        .describe('New max runs (null to clear)'),
    }),
    execute: async (input) => {
      const runtime = runtimeRef.current
      if (!runtime) return { error: 'Runtime not available' }

      const { id, ...patch } = input
      const tasks = runtime.config.schedule.tasks.map((t) => {
        if (t.id !== id) return t
        return applyTaskPatch(t, patch)
      })

      const found = tasks.some((t) => t.id === id)
      if (!found) return { error: `Task ${id} not found` }

      const config = await updateConfig(
        configStore,
        { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
        registry,
      )
      runtime.config = config
      runtime.syncSchedule()

      return { updated: tasks.find((t) => t.id === id) }
    },
  })

  const delete_schedule = createTool({
    id: 'delete_schedule',
    description: 'Delete a scheduled task by ID',
    inputSchema: z.object({
      id: z.string().uuid().describe('Task ID to delete'),
    }),
    execute: async (input) => {
      const runtime = runtimeRef.current
      if (!runtime) return { error: 'Runtime not available' }

      const before = runtime.config.schedule.tasks.length
      const tasks = runtime.config.schedule.tasks.filter((t) => t.id !== input.id)
      if (tasks.length === before) return { error: `Task ${input.id} not found` }

      const config = await updateConfig(
        configStore,
        { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
        registry,
      )
      runtime.config = config
      runtime.syncSchedule()

      return { deleted: input.id }
    },
  })

  return { list_schedules, schedule_task, schedule_recurring, update_schedule, delete_schedule }
}
