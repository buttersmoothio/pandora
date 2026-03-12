import { describe, expect, it } from 'vitest'
import type { HeartbeatCheck } from '../config'
import { buildHeartbeatPrompt, createHeartbeatTask, isWithinActiveHours } from './heartbeat'

describe('isWithinActiveHours', () => {
  // Use a January date to avoid DST ambiguity.
  // 2026-01-15T14:30:00Z → 14:30 UTC, 09:30 EST (UTC-5), 23:30 JST (UTC+9)
  const now = new Date('2026-01-15T14:30:00Z')

  it('returns true when no active hours configured', () => {
    expect(isWithinActiveHours(undefined, 'UTC', now)).toBe(true)
  })

  it('returns true when current time is inside the window', () => {
    expect(isWithinActiveHours({ start: '14:00', end: '15:00' }, 'UTC', now)).toBe(true)
  })

  it('returns true at exact start boundary', () => {
    expect(isWithinActiveHours({ start: '14:30', end: '16:00' }, 'UTC', now)).toBe(true)
  })

  it('returns false at exact end boundary (exclusive)', () => {
    expect(isWithinActiveHours({ start: '12:00', end: '14:30' }, 'UTC', now)).toBe(false)
  })

  it('returns false when current time is outside the window', () => {
    expect(isWithinActiveHours({ start: '08:00', end: '12:00' }, 'UTC', now)).toBe(false)
  })

  it('handles overnight range — inside after-start portion', () => {
    // 23:30 JST is inside 22:00-06:00
    expect(isWithinActiveHours({ start: '22:00', end: '06:00' }, 'Asia/Tokyo', now)).toBe(true)
  })

  it('handles overnight range — inside before-end portion', () => {
    // 09:30 EST is inside 20:00-10:00
    expect(isWithinActiveHours({ start: '20:00', end: '10:00' }, 'America/New_York', now)).toBe(
      true,
    )
  })

  it('handles overnight range — outside the window', () => {
    // 14:30 UTC is outside 16:00-04:00
    expect(isWithinActiveHours({ start: '16:00', end: '04:00' }, 'UTC', now)).toBe(false)
  })

  it('respects timezone conversion', () => {
    // 09:30 EST → outside 10:00-17:00
    expect(isWithinActiveHours({ start: '10:00', end: '17:00' }, 'America/New_York', now)).toBe(
      false,
    )
    // 23:30 JST → inside 23:00-23:59
    expect(isWithinActiveHours({ start: '23:00', end: '23:59' }, 'Asia/Tokyo', now)).toBe(true)
  })
})

describe('createHeartbeatTask', () => {
  it('creates a synthetic task with the heartbeat ID', () => {
    const task = createHeartbeatTask({
      enabled: true,
      cron: '*/15 * * * *',
      tasks: [],
    })
    expect(task.id).toBe('__heartbeat__')
    expect(task.name).toBe('Heartbeat')
    expect(task.cron).toBe('*/15 * * * *')
    expect(task.enabled).toBe(true)
  })

  it('maps destination from heartbeat config', () => {
    const task = createHeartbeatTask({
      enabled: true,
      cron: '*/30 * * * *',
      tasks: [],
      destination: 'Telegram',
    })
    expect(task.destination).toBe('Telegram')
  })
})

describe('buildHeartbeatPrompt', () => {
  it('returns empty string when no enabled tasks', () => {
    expect(buildHeartbeatPrompt([])).toBe('')
  })

  it('filters out disabled tasks', () => {
    const tasks: HeartbeatCheck[] = [
      { id: crypto.randomUUID(), description: 'Check email', enabled: false },
      { id: crypto.randomUUID(), description: 'Check calendar', enabled: false },
    ]
    expect(buildHeartbeatPrompt(tasks)).toBe('')
  })

  it('assembles enabled tasks into a numbered checklist', () => {
    const tasks: HeartbeatCheck[] = [
      { id: crypto.randomUUID(), description: 'Check email', enabled: true },
      { id: crypto.randomUUID(), description: 'Review calendar', enabled: true },
      { id: crypto.randomUUID(), description: 'Disabled task', enabled: false },
    ]
    const prompt = buildHeartbeatPrompt(tasks)

    expect(prompt).toContain('1. Check email')
    expect(prompt).toContain('2. Review calendar')
    expect(prompt).not.toContain('Disabled task')
    expect(prompt).toContain('send_to')
  })
})
