import { describe, expect, it } from 'vitest'
import type { HeartbeatCheck } from '../config'
import { buildHeartbeatPrompt, createHeartbeatTask, isWithinActiveHours } from './heartbeat'

describe('isWithinActiveHours', () => {
  it('returns true when no active hours configured', () => {
    expect(isWithinActiveHours(undefined, 'UTC')).toBe(true)
  })

  it('returns true during active hours (normal range)', () => {
    // Build a 2-hour window around the current UTC time
    const now = new Date()
    const startHour = Math.max(0, now.getUTCHours() - 1)
    const endHour = Math.min(23, now.getUTCHours() + 1)
    const start = `${startHour.toString().padStart(2, '0')}:00`
    const end = `${endHour.toString().padStart(2, '0')}:59`

    expect(isWithinActiveHours({ start, end }, 'UTC')).toBe(true)
  })

  it('returns false outside active hours (normal range)', () => {
    // Use a 1-minute window 12 hours away from now
    const now = new Date()
    const farHour = (now.getUTCHours() + 12) % 24
    const start = `${farHour.toString().padStart(2, '0')}:00`
    const end = `${farHour.toString().padStart(2, '0')}:01`

    expect(isWithinActiveHours({ start, end }, 'UTC')).toBe(false)
  })

  it('handles overnight range', () => {
    // 22:00 - 06:00 means active late night through early morning
    const now = new Date()
    const hour = now.getUTCHours()
    const expected = hour >= 22 || hour < 6
    expect(isWithinActiveHours({ start: '22:00', end: '06:00' }, 'UTC')).toBe(expected)
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
