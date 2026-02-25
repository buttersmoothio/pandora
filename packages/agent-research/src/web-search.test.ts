import type { GetToolsContext } from '@pandora/core/agents'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock all dynamic imports so no real SDKs are required
vi.mock('@ai-sdk/openai', () => ({
  openai: { tools: { webSearch: vi.fn(() => ({ type: 'openai-web-search' })) } },
}))
vi.mock('@ai-sdk/google', () => ({
  google: { tools: { googleSearch: vi.fn(() => ({ type: 'google-search' })) } },
}))
vi.mock('@tavily/ai-sdk', () => ({
  tavilySearch: vi.fn(() => ({ type: 'tavily-search' })),
}))
vi.mock('@exalabs/ai-sdk', () => ({
  webSearch: vi.fn(() => ({ type: 'exa-search' })),
}))
vi.mock('@perplexity-ai/ai-sdk', () => ({
  perplexitySearch: vi.fn(() => ({ type: 'perplexity-search' })),
}))

const { webSearch } = await import('./web-search')
// biome-ignore lint/style/noNonNullAssertion: getTools is defined on this agent
const getTools = webSearch.getTools!

function ctx(overrides: Partial<GetToolsContext> = {}): GetToolsContext {
  return {
    model: 'anthropic/claude-sonnet-4-20250514',
    pluginConfig: { enabled: true },
    env: {},
    ...overrides,
  }
}

describe('web-search getTools', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('is defined on the agent', () => {
    expect(webSearch.getTools).toBeTypeOf('function')
  })

  // --- Preferred backend ---

  it('uses explicit preferred backend when available', async () => {
    const result = await getTools(
      ctx({
        pluginConfig: { enabled: true, searchBackend: 'tavily' },
        env: { TAVILY_API_KEY: 'key' },
      }),
    )

    expect(result).toEqual({ webSearch: { type: 'tavily-search' } })
  })

  it('falls through to auto-detect when preferred backend env var is missing', async () => {
    const result = await getTools(
      ctx({
        model: 'perplexity/sonar',
        pluginConfig: { enabled: true, searchBackend: 'tavily' },
        env: {}, // no TAVILY_API_KEY
      }),
    )

    // Should fall through to perplexity native
    expect(result).toEqual({})
  })

  // --- Native model search ---

  it('returns empty tools for perplexity models (built-in search)', async () => {
    const result = await getTools(ctx({ model: 'perplexity/sonar' }))
    expect(result).toEqual({})
  })

  it('returns empty tools for perplexity model variants', async () => {
    const result = await getTools(ctx({ model: 'perplexity/sonar-pro' }))
    expect(result).toEqual({})
  })

  it('returns openai web search tool for openai models', async () => {
    const result = await getTools(ctx({ model: 'openai/gpt-4o' }))
    expect(result).toEqual({ web_search: { type: 'openai-web-search' } })
  })

  it('returns google search tool for google models', async () => {
    const result = await getTools(ctx({ model: 'google/gemini-2.0-flash' }))
    expect(result).toEqual({ google_search: { type: 'google-search' } })
  })

  // --- Tool-based fallback ---

  it('falls back to tavily when env var is set and model has no native search', async () => {
    const result = await getTools(
      ctx({
        model: 'anthropic/claude-sonnet-4-20250514',
        env: { TAVILY_API_KEY: 'key' },
      }),
    )

    expect(result).toEqual({ webSearch: { type: 'tavily-search' } })
  })

  it('falls back to exa when only EXA_API_KEY is set', async () => {
    const result = await getTools(
      ctx({
        model: 'anthropic/claude-sonnet-4-20250514',
        env: { EXA_API_KEY: 'key' },
      }),
    )

    expect(result).toEqual({ webSearch: { type: 'exa-search' } })
  })

  it('prefers tavily over exa when both env vars are set (order priority)', async () => {
    const result = await getTools(
      ctx({
        model: 'anthropic/claude-sonnet-4-20250514',
        env: { TAVILY_API_KEY: 'key', EXA_API_KEY: 'key' },
      }),
    )

    expect(result).toEqual({ webSearch: { type: 'tavily-search' } })
  })

  // --- No capability ---

  it('returns null when no search capability is available', async () => {
    const result = await getTools(
      ctx({
        model: 'anthropic/claude-sonnet-4-20250514',
        env: {},
      }),
    )

    expect(result).toBeNull()
  })

  // --- auto config ---

  it('treats "auto" searchBackend same as no preference', async () => {
    const result = await getTools(
      ctx({
        model: 'perplexity/sonar',
        pluginConfig: { enabled: true, searchBackend: 'auto' },
      }),
    )

    expect(result).toEqual({})
  })

  // --- Preferred overrides native ---

  it('preferred backend takes priority over native model search', async () => {
    const result = await getTools(
      ctx({
        model: 'openai/gpt-4o',
        pluginConfig: { enabled: true, searchBackend: 'tavily' },
        env: { TAVILY_API_KEY: 'key' },
      }),
    )

    // Tavily wins over OpenAI native because user explicitly chose it
    expect(result).toEqual({ webSearch: { type: 'tavily-search' } })
  })
})
