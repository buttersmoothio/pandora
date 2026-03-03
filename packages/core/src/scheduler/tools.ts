import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { Config, ScheduledTask } from '../config'
import { updateConfig } from '../config'
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

  const create_schedule = createTool({
    id: 'create_schedule',
    description:
      'Create a new scheduled task. Provide a cron expression, a name, and the prompt the agent should execute on schedule.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Human-readable task name'),
      cron: z.string().min(1).describe('Cron expression (e.g. "0 8 * * *" for daily at 8am)'),
      prompt: z.string().min(1).describe('The prompt the agent will execute on each run'),
      enabled: z.boolean().default(true).describe('Whether the task is active'),
      timezone: z.string().optional().describe('IANA timezone (e.g. "America/New_York")'),
      maxRuns: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max number of runs (omit for recurring forever, 1 for one-shot)'),
    }),
    execute: async (input) => {
      const runtime = runtimeRef.current
      if (!runtime) return { error: 'Runtime not available' }

      const task: ScheduledTask = {
        id: crypto.randomUUID(),
        ...input,
      }

      const tasks = [...runtime.config.schedule.tasks, task]
      const config = await updateConfig(
        configStore,
        { schedule: { enabled: runtime.config.schedule.enabled, tasks } },
        registry,
      )
      runtime.config = config
      runtime.syncSchedule()

      return { created: task }
    },
  })

  const update_schedule = createTool({
    id: 'update_schedule',
    description: 'Update an existing scheduled task by ID',
    inputSchema: z.object({
      id: z.string().uuid().describe('Task ID to update'),
      name: z.string().min(1).optional().describe('New task name'),
      cron: z.string().min(1).optional().describe('New cron expression'),
      prompt: z.string().min(1).optional().describe('New prompt'),
      enabled: z.boolean().optional().describe('Enable or disable the task'),
      timezone: z.string().optional().describe('New timezone'),
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
        const updated = { ...t, ...patch }
        // null means clear maxRuns
        if (patch.maxRuns === null) delete (updated as Record<string, unknown>).maxRuns
        return updated as ScheduledTask
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

  return { list_schedules, create_schedule, update_schedule, delete_schedule }
}
