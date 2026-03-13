import { describe, expect, it, vi } from 'vitest'
import { tools } from '../index'

const noopLogger: {
  log: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
} = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

describe('tavily-search tool definition', () => {
  const tool = tools[0]
  // biome-ignore lint/suspicious/noExplicitAny: test assertion on JSON Schema
  const params = tool.parameters as any

  it('exports a single tool', () => {
    expect(tools).toHaveLength(1)
  })

  it('has correct id and name', () => {
    expect(tool.id).toBe('tavily_search')
    expect(tool.name).toBe('Tavily Search')
  })

  it('has a description', () => {
    expect(tool.description).toBeDefined()
    expect(tool.description.length).toBeGreaterThan(0)
  })

  it('requires query parameter', () => {
    expect(params.required).toContain('query')
  })

  it('has valid JSON Schema parameters', () => {
    expect(params.type).toBe('object')
    expect(params.properties.query).toBeDefined()
    expect(params.properties.max_results).toBeDefined()
    expect(params.properties.search_depth).toBeDefined()
  })

  it('has an execute function', () => {
    expect(tool.execute).toBeTypeOf('function')
  })

  it('throws on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    )

    await expect(
      tool.execute({ query: 'test' }, { env: { TAVILY_API_KEY: 'key' }, logger: noopLogger }),
    ).rejects.toThrow('Tavily API error: 401 Unauthorized')

    vi.unstubAllGlobals()
  })

  it('returns mapped results on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: 'Result 1', url: 'https://example.com', content: 'Description 1' }],
        }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { TAVILY_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual([
      { title: 'Result 1', url: 'https://example.com', description: 'Description 1' },
    ])

    vi.unstubAllGlobals()
  })

  it('handles empty results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { TAVILY_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual([])

    vi.unstubAllGlobals()
  })
})
