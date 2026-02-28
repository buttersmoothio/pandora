import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the backend factories
vi.mock('./backends/tavily', () => ({
  tavilySearch: vi.fn(({ apiKey }: { apiKey: string }) => ({
    id: 'web_search',
    name: 'Web Search',
    description: 'Tavily search',
    parameters: {},
    execute: async () => [],
    _backend: 'tavily',
    _apiKey: apiKey,
  })),
}))
vi.mock('./backends/exa', () => ({
  exaSearch: vi.fn(({ apiKey }: { apiKey: string }) => ({
    id: 'web_search',
    name: 'Web Search',
    description: 'Exa search',
    parameters: {},
    execute: async () => [],
    _backend: 'exa',
    _apiKey: apiKey,
  })),
}))
vi.mock('./backends/brave', () => ({
  braveSearch: vi.fn(({ apiKey }: { apiKey: string }) => ({
    id: 'web_search',
    name: 'Web Search',
    description: 'Brave search',
    parameters: {},
    execute: async () => [],
    _backend: 'brave',
    _apiKey: apiKey,
  })),
}))
vi.mock('./backends/perplexity', () => ({
  perplexitySearch: vi.fn(({ apiKey }: { apiKey: string }) => ({
    id: 'web_search',
    name: 'Web Search',
    description: 'Perplexity search',
    parameters: {},
    execute: async () => [],
    _backend: 'perplexity',
    _apiKey: apiKey,
  })),
}))

const { loadBackend, loadFirstAvailable, resolveSearchTool } = await import('./resolve')

describe('loadBackend', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for unknown backend id', () => {
    expect(loadBackend('unknown', {})).toBeNull()
  })

  it('returns null when env var is missing', () => {
    expect(loadBackend('tavily', {})).toBeNull()
  })

  it('loads tavily when env var is set', () => {
    const result = loadBackend('tavily', { TAVILY_API_KEY: 'key' })
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Tavily')
    expect(result?.tool.id).toBe('web_search')
  })

  it('loads exa when env var is set', () => {
    const result = loadBackend('exa', { EXA_API_KEY: 'key' })
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Exa')
    expect(result?.tool.id).toBe('web_search')
  })

  it('loads brave when env var is set', () => {
    const result = loadBackend('brave', { BRAVE_API_KEY: 'key' })
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Brave Search')
    expect(result?.tool.id).toBe('web_search')
  })

  it('loads perplexity when env var is set', () => {
    const result = loadBackend('perplexity', { PERPLEXITY_API_KEY: 'key' })
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Perplexity Search')
    expect(result?.tool.id).toBe('web_search')
  })
})

describe('loadFirstAvailable', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no env vars are set', () => {
    expect(loadFirstAvailable({})).toBeNull()
  })

  it('returns first available backend by priority order', () => {
    const result = loadFirstAvailable({
      TAVILY_API_KEY: 'key',
      EXA_API_KEY: 'key',
    })
    expect(result?.name).toBe('Tavily')
  })

  it('skips unavailable backends and returns next available', () => {
    const result = loadFirstAvailable({ EXA_API_KEY: 'key' })
    expect(result?.name).toBe('Exa')
  })

  it('returns perplexity when only perplexity key is set', () => {
    const result = loadFirstAvailable({ PERPLEXITY_API_KEY: 'key' })
    expect(result?.name).toBe('Perplexity Search')
  })
})

describe('resolveSearchTool', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // --- Preferred backend ---

  it('uses explicit preferred backend when available', () => {
    const result = resolveSearchTool({
      preferred: 'tavily',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result.tool).not.toBeNull()
    expect(result.tool?.id).toBe('web_search')
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Tavily for web search',
    })
  })

  it('falls through to auto-detect when preferred backend env var is missing', () => {
    const result = resolveSearchTool({
      preferred: 'tavily',
      env: { BRAVE_API_KEY: 'key' },
    })
    expect(result.tool).not.toBeNull()
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Brave Search for web search',
    })
  })

  // --- Tool-based fallback ---

  it('falls back to first available backend', () => {
    const result = resolveSearchTool({
      env: { BRAVE_API_KEY: 'key' },
    })
    expect(result.tool).not.toBeNull()
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Brave Search for web search',
    })
  })

  // --- No capability ---

  it('returns null tool with warning when no search capability is available', () => {
    const result = resolveSearchTool({ env: {} })
    expect(result.tool).toBeNull()
    expect(result.alerts).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining('No search'),
      }),
    )
  })

  // --- auto config ---

  it('treats "auto" preferred same as no preference', () => {
    const result = resolveSearchTool({
      preferred: 'auto',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result.tool).not.toBeNull()
    expect(result.alerts).toContainEqual({
      level: 'info',
      message: 'Using Tavily for web search',
    })
  })
})
