import { describe, expect, it, vi } from 'vitest'

// Mock the optional provider SDKs
vi.mock('@ai-sdk/openai', () => ({
  openai: {
    tools: {
      webSearch: () => ({ type: 'openai-web-search' }),
    },
  },
}))

vi.mock('@ai-sdk/google', () => ({
  google: {
    tools: {
      googleSearch: () => ({ type: 'google-search' }),
    },
  },
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: {
    tools: {
      webSearch_20250305: () => ({ type: 'anthropic-web-search' }),
    },
  },
}))

const { resolveModelTools } = await import('./model-tools')

describe('resolveModelTools', () => {
  it('returns empty tools when no capabilities requested', async () => {
    const { tools, alerts } = await resolveModelTools('openai/gpt-4o', [])
    expect(tools).toEqual({})
    expect(alerts).toEqual([])
  })

  describe('search capability', () => {
    it('resolves OpenAI native search', async () => {
      const { tools, alerts } = await resolveModelTools('openai/gpt-4o', ['search'])
      expect(tools).toHaveProperty('native_search')
      expect(alerts).toHaveLength(1)
      expect(alerts[0].message).toContain('OpenAI')
    })

    it('resolves Google native search', async () => {
      const { tools, alerts } = await resolveModelTools('google/gemini-2.0-flash', ['search'])
      expect(tools).toHaveProperty('google_search')
      expect(alerts[0].message).toContain('Google')
    })

    it('resolves Anthropic native search', async () => {
      const { tools, alerts } = await resolveModelTools('anthropic/claude-sonnet-4-20250514', [
        'search',
      ])
      expect(tools).toHaveProperty('native_search')
      expect(alerts[0].message).toContain('Anthropic')
    })

    it('returns empty tools for Perplexity (built-in search)', async () => {
      const { tools, alerts } = await resolveModelTools('perplexity/sonar', ['search'])
      expect(Object.keys(tools)).toHaveLength(0)
      expect(alerts[0].message).toContain('Perplexity')
    })

    it('strips vercel gateway prefix', async () => {
      const { tools } = await resolveModelTools('vercel/openai/gpt-4o', ['search'])
      expect(tools).toHaveProperty('native_search')
    })

    it('returns empty tools for unknown provider', async () => {
      const { tools, alerts } = await resolveModelTools('local/llama3', ['search'])
      expect(Object.keys(tools)).toHaveLength(0)
      expect(alerts).toHaveLength(0)
    })
  })
})
