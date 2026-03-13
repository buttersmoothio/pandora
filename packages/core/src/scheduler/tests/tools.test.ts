import { describe, expect, it, vi } from 'vitest'
import type { Config, HeartbeatCheck } from '../../config'
import { DEFAULTS } from '../../config'

// Mock updateConfig to merge patch onto current config
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>()
  return {
    ...actual,
    updateConfig: vi.fn(async (_store, patch) => {
      const base = { ...actual.DEFAULTS }
      // Deep-merge schedule if present
      if (patch.schedule) {
        return { ...base, schedule: { ...base.schedule, ...patch.schedule } }
      }
      return { ...base, ...patch }
    }),
  }
})

import { createScheduleTools } from '../tools'

// Helper to call Mastra tool execute (takes (input, ctx))
function exec(
  tool: { execute?: (...args: never) => unknown },
  input: Record<string, unknown> = {},
): unknown {
  return (tool.execute as (input: unknown, ctx: unknown) => unknown)?.(input, {})
}

// biome-ignore lint/nursery/useExplicitType: test mock factory return type is complex
function createMockDeps() {
  const config: Config = {
    ...DEFAULTS,
    schedule: {
      enabled: true,
      tasks: [],
      heartbeat: { enabled: false, cron: '*/30 * * * *', tasks: [] },
    },
  }

  const runtime = {
    config,
    scheduler: {
      nextRun: vi.fn(() => new Date('2025-01-01T00:00:00.000Z')),
      isRunning: vi.fn(() => false),
    },
    syncSchedule: vi.fn(),
  }

  const configStore = {
    get: vi.fn(async () => config),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }

  const registry = { plugins: new Map() }

  return {
    deps: {
      configStore,
      registry: registry as never,
      runtimeRef: { current: runtime as never },
      destinations: ['Web'] as [string, ...string[]],
    },
    runtime,
    config,
  }
}

describe('createScheduleTools', () => {
  it('returns all 9 tools', () => {
    const { deps } = createMockDeps()
    const tools = createScheduleTools(deps)
    expect(Object.keys(tools)).toHaveLength(9)
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'list_schedules',
        'schedule_task',
        'schedule_recurring',
        'update_schedule',
        'delete_schedule',
        'update_heartbeat',
        'add_heartbeat_check',
        'remove_heartbeat_check',
        'toggle_heartbeat_check',
      ]),
    )
  })

  describe('list_schedules', () => {
    it('returns empty tasks when runtime has none', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = await exec(tools.list_schedules)
      expect(result).toMatchObject({ enabled: true, tasks: [] })
    })

    it('returns tasks with nextRun and isRunning', async () => {
      const { deps, runtime } = createMockDeps()
      runtime.config.schedule.tasks = [
        {
          id: crypto.randomUUID(),
          name: 'Test',
          cron: '0 8 * * *',
          prompt: 'Do it',
          enabled: true,
        },
      ]
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.list_schedules)) as {
        tasks: Array<{ nextRun: string | null; isRunning: boolean }>
      }
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].nextRun).toBe('2025-01-01T00:00:00.000Z')
      expect(result.tasks[0].isRunning).toBe(false)
    })

    it('returns heartbeat info when enabled', async () => {
      const { deps, runtime } = createMockDeps()
      runtime.config.schedule.heartbeat = {
        enabled: true,
        cron: '*/15 * * * *',
        tasks: [{ id: crypto.randomUUID(), description: 'Check inbox', enabled: true }],
      }
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.list_schedules)) as {
        heartbeat: {
          cron: string
          tasks: HeartbeatCheck[]
          nextRun: string | null
          isRunning: boolean
        }
      }
      expect(result.heartbeat).toBeDefined()
      expect(result.heartbeat.cron).toBe('*/15 * * * *')
      expect(result.heartbeat.tasks).toHaveLength(1)
    })

    it('returns null heartbeat when disabled', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.list_schedules)) as { heartbeat: null }
      expect(result.heartbeat).toBeNull()
    })

    it('returns empty when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = await exec(tools.list_schedules)
      expect(result).toEqual({ tasks: [] })
    })
  })

  describe('schedule_task', () => {
    it('parses natural language time and creates task', async () => {
      const { deps, runtime } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.schedule_task, {
        name: 'Reminder',
        runAt: 'tomorrow at 3pm',
        prompt: 'Remind me',
        enabled: true,
      })) as { created: { name: string; runAt: string; id: string } }
      expect(result.created).toBeDefined()
      expect(result.created.name).toBe('Reminder')
      expect(result.created.runAt).toBeDefined()
      expect(result.created.id).toBeDefined()
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('returns error for unparseable time', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.schedule_task, {
        name: 'Bad',
        runAt: 'xyzzy',
        prompt: 'Nope',
        enabled: true,
      })) as { error: string }
      expect(result.error).toContain('Could not parse')
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.schedule_task, {
        name: 'Task',
        runAt: 'tomorrow at 3pm',
        prompt: 'Do it',
        enabled: true,
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })

  describe('schedule_recurring', () => {
    it('creates a recurring task with cron', async () => {
      const { deps, runtime } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.schedule_recurring, {
        name: 'Daily Report',
        cron: '0 8 * * *',
        prompt: 'Generate report',
        enabled: true,
      })) as { created: { name: string; cron: string; id: string } }
      expect(result.created).toBeDefined()
      expect(result.created.name).toBe('Daily Report')
      expect(result.created.cron).toBe('0 8 * * *')
      expect(result.created.id).toBeDefined()
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('creates a recurring task with maxRuns', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.schedule_recurring, {
        name: 'Limited Task',
        cron: '0 */6 * * *',
        prompt: 'Check status',
        enabled: true,
        maxRuns: 5,
      })) as { created: { name: string; maxRuns: number } }
      expect(result.created.name).toBe('Limited Task')
      expect(result.created.maxRuns).toBe(5)
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.schedule_recurring, {
        name: 'Task',
        cron: '0 8 * * *',
        prompt: 'Do it',
        enabled: true,
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })

  describe('update_schedule', () => {
    it('updates an existing task', async () => {
      const { deps, runtime } = createMockDeps()
      const taskId = crypto.randomUUID()
      runtime.config.schedule.tasks = [
        { id: taskId, name: 'Old Name', cron: '0 8 * * *', prompt: 'Old prompt', enabled: true },
      ]
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_schedule, {
        id: taskId,
        name: 'New Name',
        prompt: 'New prompt',
      })) as { updated: { id: string; name: string; prompt: string } }
      expect(result.updated).toBeDefined()
      expect(result.updated.id).toBe(taskId)
      expect(result.updated.name).toBe('New Name')
      expect(result.updated.prompt).toBe('New prompt')
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('updates enabled state', async () => {
      const { deps, runtime } = createMockDeps()
      const taskId = crypto.randomUUID()
      runtime.config.schedule.tasks = [
        { id: taskId, name: 'Task', cron: '0 8 * * *', prompt: 'Do it', enabled: true },
      ]
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_schedule, {
        id: taskId,
        enabled: false,
      })) as { updated: { enabled: boolean } }
      expect(result.updated.enabled).toBe(false)
    })

    it('returns error for non-existent task', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_schedule, {
        id: crypto.randomUUID(),
        name: 'New Name',
      })) as { error: string }
      expect(result.error).toContain('not found')
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_schedule, {
        id: crypto.randomUUID(),
        name: 'New Name',
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })

    it('parses runAt as natural language when updating', async () => {
      const { deps, runtime } = createMockDeps()
      const taskId = crypto.randomUUID()
      runtime.config.schedule.tasks = [
        {
          id: taskId,
          name: 'Task',
          runAt: '2025-01-01T00:00:00.000Z',
          prompt: 'Do it',
          enabled: true,
        },
      ]
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_schedule, {
        id: taskId,
        runAt: 'tomorrow at 5pm',
      })) as { updated: { runAt: string } }
      expect(result.updated).toBeDefined()
      expect(result.updated.runAt).toBeDefined()
      // Should be an ISO string, not the raw natural language
      expect(result.updated.runAt).not.toBe('tomorrow at 5pm')
    })

    it('returns error for unparseable runAt in update', async () => {
      const { deps, runtime } = createMockDeps()
      const taskId = crypto.randomUUID()
      runtime.config.schedule.tasks = [
        { id: taskId, name: 'Task', cron: '0 8 * * *', prompt: 'Do it', enabled: true },
      ]
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_schedule, {
        id: taskId,
        runAt: 'xyzzy',
      })) as { error: string }
      expect(result.error).toContain('Could not parse')
    })
  })

  describe('delete_schedule', () => {
    it('deletes an existing task', async () => {
      const { deps, runtime } = createMockDeps()
      const taskId = crypto.randomUUID()
      runtime.config.schedule.tasks = [
        { id: taskId, name: 'Delete Me', cron: '0 8 * * *', prompt: 'X', enabled: true },
      ]
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.delete_schedule, { id: taskId })) as { deleted: string }
      expect(result.deleted).toBe(taskId)
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('returns error for non-existent task', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.delete_schedule, {
        id: crypto.randomUUID(),
      })) as { error: string }
      expect(result.error).toContain('not found')
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.delete_schedule, {
        id: crypto.randomUUID(),
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })

  describe('update_heartbeat', () => {
    it('updates heartbeat enabled state', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_heartbeat, {
        enabled: true,
      })) as { heartbeat: { enabled: boolean } }
      expect(result.heartbeat).toBeDefined()
    })

    it('updates heartbeat cron', async () => {
      const { deps, runtime } = createMockDeps()
      const tools = createScheduleTools(deps)
      await exec(tools.update_heartbeat, { cron: '*/15 * * * *' })
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('updates heartbeat destination', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_heartbeat, {
        destination: 'Web',
      })) as { heartbeat: { destination?: string } }
      expect(result.heartbeat).toBeDefined()
    })

    it('updates active hours', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_heartbeat, {
        activeHoursStart: '09:00',
        activeHoursEnd: '22:00',
      })) as { heartbeat: object }
      expect(result.heartbeat).toBeDefined()
    })

    it('returns error for invalid active hours format', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_heartbeat, {
        activeHoursStart: 'nine',
        activeHoursEnd: '22:00',
      })) as { error: string }
      expect(result.error).toContain('HH:MM')
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.update_heartbeat, {
        enabled: true,
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })

  describe('add_heartbeat_check', () => {
    it('adds a check to the heartbeat', async () => {
      const { deps, runtime } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.add_heartbeat_check, {
        description: 'Check inbox',
      })) as { created: { id: string; description: string; enabled: boolean } }
      expect(result.created).toBeDefined()
      expect(result.created.description).toBe('Check inbox')
      expect(result.created.enabled).toBe(true)
      expect(result.created.id).toBeDefined()
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.add_heartbeat_check, {
        description: 'Check inbox',
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })

  describe('remove_heartbeat_check', () => {
    it('removes an existing check', async () => {
      const { deps, runtime } = createMockDeps()
      const checkId = crypto.randomUUID()
      runtime.config.schedule.heartbeat = {
        enabled: true,
        cron: '*/30 * * * *',
        tasks: [{ id: checkId, description: 'Check inbox', enabled: true }],
      }
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.remove_heartbeat_check, {
        id: checkId,
      })) as { deleted: string }
      expect(result.deleted).toBe(checkId)
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('returns error for non-existent check', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.remove_heartbeat_check, {
        id: crypto.randomUUID(),
      })) as { error: string }
      expect(result.error).toContain('not found')
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.remove_heartbeat_check, {
        id: crypto.randomUUID(),
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })

  describe('toggle_heartbeat_check', () => {
    it('toggles an enabled check to disabled', async () => {
      const { deps, runtime } = createMockDeps()
      const checkId = crypto.randomUUID()
      runtime.config.schedule.heartbeat = {
        enabled: true,
        cron: '*/30 * * * *',
        tasks: [{ id: checkId, description: 'Check inbox', enabled: true }],
      }
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.toggle_heartbeat_check, {
        id: checkId,
      })) as { updated: { id: string; enabled: boolean } }
      expect(result.updated).toBeDefined()
      expect(result.updated.id).toBe(checkId)
      expect(result.updated.enabled).toBe(false)
      expect(runtime.syncSchedule).toHaveBeenCalled()
    })

    it('toggles a disabled check to enabled', async () => {
      const { deps, runtime } = createMockDeps()
      const checkId = crypto.randomUUID()
      runtime.config.schedule.heartbeat = {
        enabled: true,
        cron: '*/30 * * * *',
        tasks: [{ id: checkId, description: 'Check inbox', enabled: false }],
      }
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.toggle_heartbeat_check, {
        id: checkId,
      })) as { updated: { enabled: boolean } }
      expect(result.updated.enabled).toBe(true)
    })

    it('returns error for non-existent check', async () => {
      const { deps } = createMockDeps()
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.toggle_heartbeat_check, {
        id: crypto.randomUUID(),
      })) as { error: string }
      expect(result.error).toContain('not found')
    })

    it('returns error when runtime is null', async () => {
      const { deps } = createMockDeps()
      deps.runtimeRef.current = null as never as never
      const tools = createScheduleTools(deps)
      const result = (await exec(tools.toggle_heartbeat_check, {
        id: crypto.randomUUID(),
      })) as { error: string }
      expect(result.error).toContain('Runtime not available')
    })
  })
})
