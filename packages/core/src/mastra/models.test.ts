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
  it('returns operator model', () => {
    expect(resolveModel(DEFAULTS, 'operator')).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('returns configured model when overridden', () => {
    const config = {
      ...DEFAULTS,
      models: {
        ...DEFAULTS.models,
        operator: { provider: 'minimax', model: 'MiniMax-M2.5' },
      },
    }
    expect(resolveModel(config, 'operator')).toBe('minimax/MiniMax-M2.5')
  })
})
