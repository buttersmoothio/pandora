import { describe, expect, it } from 'vitest'
import { extractStringEnv } from '../helpers'

describe('extractStringEnv', () => {
  it('extracts string values from raw env object', () => {
    const raw = {
      API_KEY: 'secret',
      PORT: '3000',
      FLAG: true,
      COUNT: 42,
      OBJ: { nested: true },
    }
    const result = extractStringEnv(raw)
    expect(result).toEqual({
      API_KEY: 'secret',
      PORT: '3000',
    })
  })

  it('returns empty object for empty input', () => {
    expect(extractStringEnv({})).toEqual({})
  })

  it('skips null and undefined values', () => {
    const raw = { A: null, B: undefined, C: 'ok' }
    const result = extractStringEnv(raw as Record<string, unknown>)
    expect(result).toEqual({ C: 'ok' })
  })

  it('handles empty string values', () => {
    expect(extractStringEnv({ EMPTY: '' })).toEqual({ EMPTY: '' })
  })
})
