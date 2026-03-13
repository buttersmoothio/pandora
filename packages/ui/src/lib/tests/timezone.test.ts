import { describe, expect, it } from 'vitest'
import { formatInTimezone, localInputToUtc, utcToLocalInput } from '../timezone'

describe('utcToLocalInput', () => {
  it('converts UTC to Eastern (EDT, UTC-4)', () => {
    // June 15 12:00 UTC → 08:00 EDT
    const result = utcToLocalInput('2024-06-15T12:00:00.000Z', 'America/New_York')
    expect(result).toBe('2024-06-15T08:00')
  })

  it('converts UTC to Tokyo (JST, UTC+9)', () => {
    // June 15 12:00 UTC → 21:00 JST
    const result = utcToLocalInput('2024-06-15T12:00:00.000Z', 'Asia/Tokyo')
    expect(result).toBe('2024-06-15T21:00')
  })

  it('handles date rollover across timezone', () => {
    // June 15 23:00 UTC → June 16 08:00 JST
    const result = utcToLocalInput('2024-06-15T23:00:00.000Z', 'Asia/Tokyo')
    expect(result).toBe('2024-06-16T08:00')
  })

  it('normalizes midnight hour 24 to 00', () => {
    // Midnight in UTC is still midnight
    const result = utcToLocalInput('2024-06-15T00:00:00.000Z', 'UTC')
    expect(result).toBe('2024-06-15T00:00')
  })
})

describe('localInputToUtc', () => {
  it('converts Eastern local time to UTC', () => {
    // 08:00 EDT → 12:00 UTC
    const result = localInputToUtc('2024-06-15T08:00', 'America/New_York')
    expect(result).toBe('2024-06-15T12:00:00.000Z')
  })

  it('converts Tokyo local time to UTC', () => {
    // 21:00 JST → 12:00 UTC
    const result = localInputToUtc('2024-06-15T21:00', 'Asia/Tokyo')
    expect(result).toBe('2024-06-15T12:00:00.000Z')
  })

  it('round-trips with utcToLocalInput', () => {
    const original = '2024-06-15T14:30:00.000Z'
    const tz = 'America/Los_Angeles'
    const local = utcToLocalInput(original, tz)
    const roundTripped = localInputToUtc(local, tz)
    expect(roundTripped).toBe(original)
  })

  it('round-trips with multiple timezones', () => {
    const original = '2024-12-25T03:45:00.000Z'
    for (const tz of ['Europe/London', 'Asia/Kolkata', 'Pacific/Auckland']) {
      const local = utcToLocalInput(original, tz)
      const roundTripped = localInputToUtc(local, tz)
      expect(roundTripped).toBe(original)
    }
  })
})

describe('formatInTimezone', () => {
  it('formats a date in the given timezone', () => {
    const result = formatInTimezone('2024-06-15T12:00:00.000Z', 'UTC', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    // Exact format depends on locale, but should contain the date components
    expect(result).toContain('2024')
    expect(result).toContain('15')
  })

  it('respects timezone offset in formatted output', () => {
    const utcResult = formatInTimezone('2024-06-15T00:00:00.000Z', 'UTC', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const tokyoResult = formatInTimezone('2024-06-15T00:00:00.000Z', 'Asia/Tokyo', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    // UTC midnight vs Tokyo 09:00 — should differ
    expect(utcResult).not.toBe(tokyoResult)
  })
})
