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
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: { tools: { googleSearch: vi.fn(() => ({ type: 'google-vertex-search' })) } },
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
    expect(result).toEqual({ tools: { webSearch: { type: 'tavily' } }, name: 'Tavily' })
  })

  it('loads exa when env var is set', async () => {
    const result = await loadBackend('exa', { EXA_API_KEY: 'key' })
    expect(result).toEqual({ tools: { webSearch: { type: 'exa' } }, name: 'Exa' })
  })

  it('loads perplexity when env var is set', async () => {
    const result = await loadBackend('perplexity', { PERPLEXITY_API_KEY: 'key' })
    expect(result).toEqual({
      tools: { webSearch: { type: 'perplexity' } },
      name: 'Perplexity Search',
    })
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
    expect(result).toEqual({ tools: { webSearch: { type: 'tavily' } }, name: 'Tavily' })
  })

  it('skips unavailable backends and returns next available', async () => {
    const result = await loadFirstAvailable({ EXA_API_KEY: 'key' })
    expect(result).toEqual({ tools: { webSearch: { type: 'exa' } }, name: 'Exa' })
  })

  it('returns perplexity when only perplexity key is set', async () => {
    const result = await loadFirstAvailable({ PERPLEXITY_API_KEY: 'key' })
    expect(result).toEqual({
      tools: { webSearch: { type: 'perplexity' } },
      name: 'Perplexity Search',
    })
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
    expect(result.tools).toEqual({ webSearch: { type: 'tavily' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Tavily for web search',
    })
  })

  it('falls through to auto-detect when preferred backend env var is missing', async () => {
    const result = await resolveSearchTools({
      model: 'perplexity/sonar',
      preferred: 'tavily',
      env: {},
    })
    expect(result.tools).toEqual({})
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Perplexity built-in search',
    })
  })

  it('preferred backend takes priority over native model search', async () => {
    const result = await resolveSearchTools({
      model: 'openai/gpt-4o',
      preferred: 'tavily',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result.tools).toEqual({ webSearch: { type: 'tavily' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Tavily for web search',
    })
  })

  // --- Native model search ---

  it('returns empty tools for perplexity models (built-in search)', async () => {
    const result = await resolveSearchTools({
      model: 'perplexity/sonar',
      env: {},
    })
    expect(result.tools).toEqual({})
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Perplexity built-in search',
    })
  })

  it('returns openai web search tool for openai models', async () => {
    const result = await resolveSearchTools({
      model: 'openai/gpt-4o',
      env: {},
    })
    expect(result.tools).toEqual({ web_search: { type: 'openai-web-search' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using OpenAI native search',
    })
  })

  it('returns google search tool for google models (direct)', async () => {
    const result = await resolveSearchTools({
      model: 'google/gemini-2.0-flash',
      env: {},
    })
    expect(result.tools).toEqual({ google_search: { type: 'google-search' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Google native search',
    })
  })

  it('returns vertex search tool for vercel/google models', async () => {
    const result = await resolveSearchTools({
      model: 'vercel/google/gemini-2.0-flash',
      env: {},
    })
    expect(result.tools).toEqual({ google_search: { type: 'google-vertex-search' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Google Vertex native search',
    })
  })

  it('returns anthropic web search tool for anthropic models', async () => {
    const result = await resolveSearchTools({
      model: 'anthropic/claude-sonnet-4-20250514',
      env: {},
    })
    expect(result.tools).toEqual({ web_search: { type: 'anthropic-web-search' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Anthropic native search',
    })
  })

  // --- Vercel gateway prefix ---

  it('strips vercel/ prefix and detects native openai search', async () => {
    const result = await resolveSearchTools({
      model: 'vercel/openai/gpt-4o',
      env: {},
    })
    expect(result.tools).toEqual({ web_search: { type: 'openai-web-search' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using OpenAI native search',
    })
  })

  it('strips vercel/ prefix and detects native anthropic search', async () => {
    const result = await resolveSearchTools({
      model: 'vercel/anthropic/claude-sonnet-4-20250514',
      env: {},
    })
    expect(result.tools).toEqual({ web_search: { type: 'anthropic-web-search' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Anthropic native search',
    })
  })

  // --- Tool-based fallback ---

  it('falls back to tavily when env var is set and model has no native search', async () => {
    const result = await resolveSearchTools({
      model: 'mistral/mistral-large',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result.tools).toEqual({ webSearch: { type: 'tavily' } })
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Tavily for web search',
    })
  })

  // --- No capability ---

  it('returns null tools with warning when no search capability is available', async () => {
    const result = await resolveSearchTools({
      model: 'mistral/mistral-large',
      env: {},
    })
    expect(result.tools).toBeNull()
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ level: 'warning', message: expect.stringContaining('No search') }),
    )
  })

  // --- auto config ---

  it('treats "auto" preferred same as no preference', async () => {
    const result = await resolveSearchTools({
      model: 'perplexity/sonar',
      preferred: 'auto',
      env: {},
    })
    expect(result.tools).toEqual({})
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Perplexity built-in search',
    })
  })
})
