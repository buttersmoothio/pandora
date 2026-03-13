import { createTool } from '@mastra/core/tools'
import * as chrono from 'chrono-node'
import { z } from 'zod'
import {
  applyTaskPatch,
  type Config,
  type HeartbeatConfig,
  type ScheduledTask,
  updateConfig,
} from '../config'
import type { PandoraRuntime } from '../runtime/pandora-runtime'
import type { PluginRegistry } from '../runtime/plugin-registry'
import type { ConfigStore } from '../storage/config-store'
import type { ToolRecord } from '../tools/types'
import { HEARTBEAT_TASK_ID } from './heartbeat'

export interface ScheduleToolDeps {
  configStore: ConfigStore<Config>
  registry: PluginRegistry
  runtimeRef: { current: PandoraRuntime | null }
  /** Available notification destinations (friendly names). Always includes "Web". */
  destinations: [string, ...string[]]
}

const TIME_RE = /^\d{2}:\d{2}$/

function parseActiveHours(
  startInput: string | undefined,
  endInput: string | undefined,
): { changed: boolean; value?: { start: string; end: string }; error?: string } {
  if (startInput === undefined && endInput === undefined) {
    return { changed: false }
  }
  const start = startInput ?? ''
  const end = endInput ?? ''
  if (start === '' && end === '') {
    return { changed: true, value: undefined }
  }
  if (!(TIME_RE.test(start) && TIME_RE.test(end))) {
    return { changed: false, error: 'activeHoursStart and activeHoursEnd must be in HH:MM format' }
  }
  return { changed: true, value: { start, end } }
}

export function createScheduleTools(deps: ScheduleToolDeps): ToolRecord {
  const { configStore, registry, runtimeRef, destinations } = deps

  const destinationSchema = z
    .enum(destinations)
    .optional()
    .describe('Where to deliver the notification when this task runs')

  const list_schedules = createTool({
    id: 'list_schedules',
    description: 'List all scheduled tasks with their next run time',
    mcp: { annotations: { readOnlyHint: true } },
    inputSchema: z.object({}),
    execute: async () => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { tasks: [] }
      }

      const tasks = runtime.config.schedule.tasks.map((task) => ({
        ...task,
        nextRun: runtime.scheduler?.nextRun(task.id)?.toISOString() ?? null,
        isRunning: runtime.scheduler?.isRunning(task.id) ?? false,
      }))
      const heartbeat = runtime.config.schedule.heartbeat
      return {
        enabled: runtime.config.schedule.enabled,
        tasks,
        heartbeat: heartbeat.enabled
          ? {
              cron: heartbeat.cron,
              tasks: heartbeat.tasks,
              nextRun: runtime.scheduler?.nextRun(HEARTBEAT_TASK_ID)?.toISOString() ?? null,
              isRunning: runtime.scheduler?.isRunning(HEARTBEAT_TASK_ID) ?? false,
            }
          : null,
      }
    },
  })

  const createTask = async (input: Omit<ScheduledTask, 'id'>): Promise<Record<string, unknown>> => {
    const runtime = runtimeRef.current
    if (!runtime) {
      return { error: 'Runtime not available' }
    }

    const task: ScheduledTask = { ...input, id: crypto.randomUUID() }
    const tasks = [...runtime.config.schedule.tasks, task]
    const config = await updateConfig(
      configStore,
      { schedule: { ...runtime.config.schedule, tasks } },
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
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      name: z.string().min(1).describe('Human-readable task name'),
      runAt: z
        .string()
        .min(1)
        .describe(
          'Natural language time expression (e.g. "tomorrow at 3pm", "in 2 hours", "next Friday at 9am", "March 15 at noon")',
        ),
      prompt: z.string().min(1).describe('The prompt the agent will execute when the task runs'),
      enabled: z.boolean().default(true).describe('Whether the task is active'),
      destination: destinationSchema,
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const tz = runtimeRef.current?.config.timezone
      const parsed = chrono.parseDate(input.runAt, { instant: new Date(), timezone: tz })
      if (!parsed) {
        return { error: `Could not parse time: "${input.runAt}"` }
      }
      return createTask({ ...input, runAt: parsed.toISOString() })
    },
  })

  const schedule_recurring = createTool({
    id: 'schedule_recurring',
    description:
      'Create a standalone recurring task. Use for daily reports, weekly analyses, periodic summaries.',
    mcp: { annotations: { readOnlyHint: false } },
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
      maxRuns: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Max number of runs (omit to run forever)'),
      destination: destinationSchema,
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => createTask(input),
  })

  const update_schedule = createTool({
    id: 'update_schedule',
    description: 'Update an existing scheduled task by ID',
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      id: z.uuid().describe('Task ID to update'),
      name: z.string().min(1).optional().describe('New task name'),
      cron: z.string().min(1).optional().describe('New cron expression'),
      runAt: z
        .string()
        .min(1)
        .optional()
        .describe('New natural language time expression (e.g. "tomorrow at 3pm")'),
      prompt: z.string().min(1).optional().describe('New prompt'),
      enabled: z.boolean().optional().describe('Enable or disable the task'),
      maxRuns: z.number().int().positive().optional().describe('New max runs'),
      destination: destinationSchema,
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { error: 'Runtime not available' }
      }

      const { id, ...patch } = input
      if (patch.runAt) {
        const tz = runtime.config.timezone
        const parsed = chrono.parseDate(patch.runAt, { instant: new Date(), timezone: tz })
        if (!parsed) {
          return { error: `Could not parse time: "${patch.runAt}"` }
        }
        patch.runAt = parsed.toISOString()
      }
      const tasks = runtime.config.schedule.tasks.map((t) => {
        if (t.id !== id) {
          return t
        }
        return applyTaskPatch(t, patch)
      })

      const found = tasks.some((t) => t.id === id)
      if (!found) {
        return { error: `Task ${id} not found` }
      }

      const config = await updateConfig(
        configStore,
        { schedule: { ...runtime.config.schedule, tasks } },
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
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      id: z.uuid().describe('Task ID to delete'),
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { error: 'Runtime not available' }
      }

      const before = runtime.config.schedule.tasks.length
      const tasks = runtime.config.schedule.tasks.filter((t) => t.id !== input.id)
      if (tasks.length === before) {
        return { error: `Task ${input.id} not found` }
      }

      const config = await updateConfig(
        configStore,
        { schedule: { ...runtime.config.schedule, tasks } },
        registry,
      )
      runtime.config = config
      runtime.syncSchedule()

      return { deleted: input.id }
    },
  })

  async function saveHeartbeat(
    runtime: PandoraRuntime,
    heartbeat: HeartbeatConfig,
  ): Promise<HeartbeatConfig> {
    const config = await updateConfig(
      configStore,
      { schedule: { ...runtime.config.schedule, heartbeat } },
      registry,
    )
    runtime.config = config
    runtime.syncSchedule()
    return config.schedule.heartbeat
  }

  const update_heartbeat = createTool({
    id: 'update_heartbeat',
    description:
      'Configure the heartbeat — periodic awareness that evaluates a checklist and only notifies when something needs attention. Use heartbeat for batching multiple periodic checks (inbox + calendar + notifications) with context-awareness.',
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      enabled: z.boolean().optional(),
      cron: z.string().min(1).optional(),
      destination: z.enum(destinations).optional(),
      activeHoursStart: z
        .string()
        .optional()
        .describe(
          'Start of active hours in HH:MM format (e.g. "09:00"). Set both start and end to update. Set both to empty string to clear.',
        ),
      activeHoursEnd: z
        .string()
        .optional()
        .describe(
          'End of active hours in HH:MM format (e.g. "22:00"). Set both start and end to update. Set both to empty string to clear.',
        ),
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { error: 'Runtime not available' }
      }

      const current = runtime.config.schedule.heartbeat
      const updated = { ...current }
      if (input.enabled !== undefined) {
        updated.enabled = input.enabled
      }
      if (input.cron !== undefined) {
        updated.cron = input.cron
      }
      if (input.destination !== undefined) {
        updated.destination = input.destination
      }

      const activeHoursResult = parseActiveHours(input.activeHoursStart, input.activeHoursEnd)
      if (activeHoursResult.error) {
        return { error: activeHoursResult.error }
      }
      if (activeHoursResult.changed) {
        updated.activeHours = activeHoursResult.value
      }

      return { heartbeat: await saveHeartbeat(runtime, updated) }
    },
  })

  const add_heartbeat_check = createTool({
    id: 'add_heartbeat_check',
    description:
      'Add a check to the heartbeat checklist. Checks are batched and evaluated together on each heartbeat run.',
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      description: z.string().min(1),
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { error: 'Runtime not available' }
      }

      const check = { id: crypto.randomUUID(), description: input.description, enabled: true }
      const heartbeat = {
        ...runtime.config.schedule.heartbeat,
        tasks: [...runtime.config.schedule.heartbeat.tasks, check],
      }
      await saveHeartbeat(runtime, heartbeat)
      return { created: check }
    },
  })

  const remove_heartbeat_check = createTool({
    id: 'remove_heartbeat_check',
    description: 'Remove a check from the heartbeat checklist by ID',
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      id: z.uuid(),
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { error: 'Runtime not available' }
      }

      const current = runtime.config.schedule.heartbeat
      const before = current.tasks.length
      const tasks = current.tasks.filter((t) => t.id !== input.id)
      if (tasks.length === before) {
        return { error: `Check ${input.id} not found` }
      }

      await saveHeartbeat(runtime, { ...current, tasks })
      return { deleted: input.id }
    },
  })

  const toggle_heartbeat_check = createTool({
    id: 'toggle_heartbeat_check',
    description: 'Enable or disable a heartbeat check without removing it',
    mcp: { annotations: { readOnlyHint: false } },
    inputSchema: z.object({
      id: z.uuid(),
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const runtime = runtimeRef.current
      if (!runtime) {
        return { error: 'Runtime not available' }
      }

      const current = runtime.config.schedule.heartbeat
      let toggled = null
      const tasks = current.tasks.map((t) => {
        if (t.id !== input.id) {
          return t
        }
        toggled = { ...t, enabled: !t.enabled }
        return toggled
      })
      if (!toggled) {
        return { error: `Check ${input.id} not found` }
      }

      await saveHeartbeat(runtime, { ...current, tasks })
      return { updated: toggled }
    },
  })

  return {
    list_schedules,
    schedule_task,
    schedule_recurring,
    update_schedule,
    delete_schedule,
    update_heartbeat,
    add_heartbeat_check,
    remove_heartbeat_check,
    toggle_heartbeat_check,
  }
}
