import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tavily/ai-sdk', () => ({
  tavilySearch: vi.fn(() => ({ type: 'tavily' })),
}))
vi.mock('@exalabs/ai-sdk', () => ({
  webSearch: vi.fn(() => ({ type: 'exa' })),
}))
vi.mock('@perplexity-ai/ai-sdk', () => ({
  perplexitySearch: vi.fn(() => ({ type: 'perplexity' })),
}))
vi.mock('@ai-sdk/openai', () => ({
  openai: { tools: { webSearch: vi.fn(() => ({ type: 'openai-web-search' })) } },
}))
vi.mock('@ai-sdk/google', () => ({
  google: { tools: { googleSearch: vi.fn(() => ({ type: 'google-search' })) } },
}))
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: { tools: { webSearch_20250305: vi.fn(() => ({ type: 'anthropic-web-search' })) } },
}))

const { loadBackend, loadFirstAvailable, resolveSearchTools } = await import('./resolve')

describe('loadBackend', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for unknown backend id', async () => {
    expect(await loadBackend('unknown', {})).toBeNull()
  })

  it('returns null when env var is missing', async () => {
    expect(await loadBackend('tavily', {})).toBeNull()
  })

  it('loads tavily when env var is set', async () => {
    const result = await loadBackend('tavily', { TAVILY_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  it('loads exa when env var is set', async () => {
    const result = await loadBackend('exa', { EXA_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'exa' } })
  })

  it('loads perplexity when env var is set', async () => {
    const result = await loadBackend('perplexity', { PERPLEXITY_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'perplexity' } })
  })
})

describe('loadFirstAvailable', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no env vars are set', async () => {
    expect(await loadFirstAvailable({})).toBeNull()
  })

  it('returns first available backend by priority order', async () => {
    const result = await loadFirstAvailable({
      TAVILY_API_KEY: 'key',
      EXA_API_KEY: 'key',
    })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  it('skips unavailable backends and returns next available', async () => {
    const result = await loadFirstAvailable({ EXA_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'exa' } })
  })

  it('returns perplexity when only perplexity key is set', async () => {
    const result = await loadFirstAvailable({ PERPLEXITY_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'perplexity' } })
  })
})

describe('resolveSearchTools', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // --- Preferred backend ---

  it('uses explicit preferred backend when available', async () => {
    const result = await resolveSearchTools({
      model: 'anthropic/claude-sonnet-4-20250514',
      preferred: 'tavily',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  it('falls through to auto-detect when preferred backend env var is missing', async () => {
    const result = await resolveSearchTools({
      model: 'perplexity/sonar',
      preferred: 'tavily',
      env: {},
    })
    expect(result).toEqual({})
  })

  it('preferred backend takes priority over native model search', async () => {
    const result = await resolveSearchTools({
      model: 'openai/gpt-4o',
      preferred: 'tavily',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  // --- Native model search ---

  it('returns empty tools for perplexity models (built-in search)', async () => {
    const result = await resolveSearchTools({
      model: 'perplexity/sonar',
      env: {},
    })
    expect(result).toEqual({})
  })

  it('returns openai web search tool for openai models', async () => {
    const result = await resolveSearchTools({
      model: 'openai/gpt-4o',
      env: {},
    })
    expect(result).toEqual({ web_search: { type: 'openai-web-search' } })
  })

  it('returns google search tool for google models', async () => {
    const result = await resolveSearchTools({
      model: 'google/gemini-2.0-flash',
      env: {},
    })
    expect(result).toEqual({ google_search: { type: 'google-search' } })
  })

  it('returns anthropic web search tool for anthropic models', async () => {
    const result = await resolveSearchTools({
      model: 'anthropic/claude-sonnet-4-20250514',
      env: {},
    })
    expect(result).toEqual({ web_search: { type: 'anthropic-web-search' } })
  })

  // --- Vercel gateway prefix ---

  it('strips vercel/ prefix and detects native openai search', async () => {
    const result = await resolveSearchTools({
      model: 'vercel/openai/gpt-4o',
      env: {},
    })
    expect(result).toEqual({ web_search: { type: 'openai-web-search' } })
  })

  it('strips vercel/ prefix and detects native anthropic search', async () => {
    const result = await resolveSearchTools({
      model: 'vercel/anthropic/claude-sonnet-4-20250514',
      env: {},
    })
    expect(result).toEqual({ web_search: { type: 'anthropic-web-search' } })
  })

  // --- Tool-based fallback ---

  it('falls back to tavily when env var is set and model has no native search', async () => {
    const result = await resolveSearchTools({
      model: 'mistral/mistral-large',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  // --- No capability ---

  it('returns null when no search capability is available', async () => {
    const result = await resolveSearchTools({
      model: 'mistral/mistral-large',
      env: {},
    })
    expect(result).toBeNull()
  })

  // --- auto config ---

  it('treats "auto" preferred same as no preference', async () => {
    const result = await resolveSearchTools({
      model: 'perplexity/sonar',
      preferred: 'auto',
      env: {},
    })
    expect(result).toEqual({})
  })
})
