import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTokens, timeAgo } from '../memory-utils'

describe('formatTokens', () => {
  it('returns string for values under 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(10000)).toBe('10.0k')
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent times', () => {
    expect(timeAgo('2024-06-15T11:59:30.000Z')).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(timeAgo('2024-06-15T11:55:00.000Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(timeAgo('2024-06-15T09:00:00.000Z')).toBe('3h ago')
  })

  it('returns days ago for less than 30 days', () => {
    expect(timeAgo('2024-06-13T12:00:00.000Z')).toBe('2d ago')
  })

  it('returns formatted date for 30+ days', () => {
    const result = timeAgo('2024-05-01T12:00:00.000Z')
    expect(result).not.toContain('ago')
    expect(result).toBeTruthy()
  })
})
