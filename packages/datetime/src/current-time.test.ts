import { describe, expect, it, vi } from 'vitest'
import { currentTime } from './current-time'
import { tools } from './index'

const noopLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('current-time tool (plain export)', () => {
  it('has required Tool fields', () => {
    expect(currentTime.id).toBe('current-time')
    expect(currentTime.name).toBe('Current Time')
    expect(currentTime.description).toBeDefined()
    expect(currentTime.execute).toBeTypeOf('function')
  })

  it('has JSON Schema parameters', () => {
    expect(currentTime.parameters).toEqual({
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: expect.any(String),
        },
      },
    })
  })

  it('has MCP annotations', () => {
    expect(currentTime.annotations?.readOnlyHint).toBe(true)
    expect(currentTime.annotations?.idempotentHint).toBe(true)
  })

  it('returns ISO timestamp for default UTC', async () => {
    const result = (await currentTime.execute({}, { env: {}, logger: noopLogger })) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.timezone).toBe('UTC')
  })

  it('accepts a timezone', async () => {
    const result = (await currentTime.execute(
      { timezone: 'America/New_York' },
      { env: {}, logger: noopLogger },
    )) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.timezone).toBe('America/New_York')
    expect(result.iso).toBeDefined()
  })

  it('falls back to UTC for invalid timezone', async () => {
    const result = (await currentTime.execute(
      { timezone: 'Invalid/Zone' },
      { env: {}, logger: noopLogger },
    )) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.timezone).toBe('UTC')
  })
})

describe('tools export', () => {
  it('tools array contains current-time', () => {
    expect(tools.map((t) => t.id)).toEqual(['current-time'])
  })
})
