import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../config'
import { buildModelString, resolveModel } from './models'

describe('buildModelString', () => {
  it('joins provider and model with slash', () => {
    expect(buildModelString({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' })).toBe(
      'anthropic/claude-sonnet-4-20250514',
    )
  })

  it('works with any provider', () => {
    expect(buildModelString({ provider: 'openai', model: 'gpt-4o' })).toBe('openai/gpt-4o')
  })
})

describe('resolveModel', () => {
  it('returns default model when no key specified', () => {
    expect(resolveModel(DEFAULTS)).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('returns default model for explicit default key', () => {
    expect(resolveModel(DEFAULTS, 'default')).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('falls back to default when fast is not configured', () => {
    expect(resolveModel(DEFAULTS, 'fast')).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('falls back to default when reasoning is not configured', () => {
    expect(resolveModel(DEFAULTS, 'reasoning')).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('returns fast model when configured', () => {
    const config = {
      ...DEFAULTS,
      models: {
        ...DEFAULTS.models,
        fast: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      },
    }
    expect(resolveModel(config, 'fast')).toBe('anthropic/claude-haiku-4-5-20251001')
  })
})
