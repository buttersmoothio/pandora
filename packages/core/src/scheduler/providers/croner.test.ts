import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTask } from '../../config'
import type { TaskHandler } from '../index'
import { CronerScheduler } from './croner'

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: crypto.randomUUID(),
    name: 'Test Task',
    cron: '* * * * *', // every minute
    prompt: 'do something',
    enabled: true,
    ...overrides,
  }
}

describe('CronerScheduler', () => {
  let handler: TaskHandler
  let scheduler: CronerScheduler

  beforeEach(() => {
    handler = vi.fn(async () => {})
    scheduler = new CronerScheduler(handler)
  })

  afterEach(() => {
    scheduler.stop()
  })

  it('starts jobs for enabled tasks', () => {
    const task = makeTask()
    scheduler.sync([task])
    expect(scheduler.nextRun(task.id)).toBeInstanceOf(Date)
  })

  it('skips disabled tasks', () => {
    const task = makeTask({ enabled: false })
    scheduler.sync([task])
    expect(scheduler.nextRun(task.id)).toBeNull()
  })

  it('replaces previous jobs on re-sync', () => {
    const task1 = makeTask({ name: 'Task 1' })
    const task2 = makeTask({ name: 'Task 2' })

    scheduler.sync([task1])
    expect(scheduler.nextRun(task1.id)).not.toBeNull()

    scheduler.sync([task2])
    expect(scheduler.nextRun(task1.id)).toBeNull()
    expect(scheduler.nextRun(task2.id)).not.toBeNull()
  })

  it('stop() clears all jobs', () => {
    const task = makeTask()
    scheduler.sync([task])
    scheduler.stop()
    expect(scheduler.nextRun(task.id)).toBeNull()
  })

  it('isRunning() returns false when not executing', () => {
    const task = makeTask()
    scheduler.sync([task])
    expect(scheduler.isRunning(task.id)).toBe(false)
  })

  it('handles invalid cron expressions gracefully', () => {
    const task = makeTask({ cron: 'invalid cron' })
    // Should not throw
    expect(() => scheduler.sync([task])).not.toThrow()
    expect(scheduler.nextRun(task.id)).toBeNull()
  })

  it('handler errors do not crash the scheduler', async () => {
    const failHandler = vi.fn(async () => {
      throw new Error('handler failed')
    })
    const s = new CronerScheduler(failHandler)

    // Use a cron that fires immediately via maxRuns: 1 and a very short interval
    const task = makeTask({ cron: '* * * * * *', maxRuns: 1 }) // every second
    s.sync([task])

    // Wait for execution
    await vi.waitFor(() => expect(failHandler).toHaveBeenCalled(), { timeout: 3000 })
    s.stop()
  })

  it('calls onComplete when maxRuns is exhausted', async () => {
    const onComplete = vi.fn()
    const s = new CronerScheduler(handler, onComplete)

    const task = makeTask({ cron: '* * * * * *', maxRuns: 1 }) // every second, run once
    s.sync([task])

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith(task.id), { timeout: 3000 })
    s.stop()
  })
})
