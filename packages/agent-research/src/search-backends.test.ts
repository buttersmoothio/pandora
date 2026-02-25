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

const { loadBackend, loadFirstAvailable } = await import('./search-backends')

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
    // Tavily comes first in the backends array
    const result = await loadFirstAvailable({
      TAVILY_API_KEY: 'key',
      EXA_API_KEY: 'key',
    })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  it('skips unavailable backends and returns next available', async () => {
    // Only exa key set, tavily should be skipped
    const result = await loadFirstAvailable({ EXA_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'exa' } })
  })

  it('returns perplexity when only perplexity key is set', async () => {
    const result = await loadFirstAvailable({ PERPLEXITY_API_KEY: 'key' })
    expect(result).toEqual({ webSearch: { type: 'perplexity' } })
  })
})
