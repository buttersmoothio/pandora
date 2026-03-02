import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './config'
import { buildModelString, resolveModel } from './models'

describe('buildModelString', () => {
  it('joins provider and model with slash', () => {
    expect(buildModelString({ provider: 'openai', model: 'gpt-4o' })).toBe('openai/gpt-4o')
  })

  it('handles nested provider names', () => {
    expect(buildModelString({ provider: 'vercel', model: 'openai/gpt-4o' })).toBe(
      'vercel/openai/gpt-4o',
    )
  })

  it('handles single-word values', () => {
    expect(buildModelString({ provider: 'local', model: 'llama3' })).toBe('local/llama3')
  })
})

describe('resolveModel', () => {
  it('resolves operator model from default config', () => {
    const result = resolveModel(DEFAULTS, 'operator')
    expect(result).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('resolves custom model from config', () => {
    const config = {
      ...DEFAULTS,
      models: {
        ...DEFAULTS.models,
        operator: { provider: 'google', model: 'gemini-2.0-flash' },
      },
    }
    expect(resolveModel(config, 'operator')).toBe('google/gemini-2.0-flash')
  })
})
