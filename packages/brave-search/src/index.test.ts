import { describe, expect, it, vi } from 'vitest'
import { tools } from './index'

const noopLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('brave-search tool definition', () => {
  const tool = tools[0]
  // biome-ignore lint/suspicious/noExplicitAny: test assertion on JSON Schema
  const params = tool.parameters as any

  it('exports a single tool', () => {
    expect(tools).toHaveLength(1)
  })

  it('has correct id and name', () => {
    expect(tool.id).toBe('brave_search')
    expect(tool.name).toBe('Brave Search')
  })

  it('has a description', () => {
    expect(tool.description).toBeDefined()
  })

  it('requires query parameter', () => {
    expect(params.required).toContain('query')
  })

  it('has valid JSON Schema parameters', () => {
    expect(params.type).toBe('object')
    expect(params.properties.query).toBeDefined()
    expect(params.properties.count).toBeDefined()
    expect(params.properties.freshness).toBeDefined()
  })

  it('throws on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }),
    )

    await expect(
      tool.execute({ query: 'test' }, { env: { BRAVE_API_KEY: 'key' }, logger: noopLogger }),
    ).rejects.toThrow('Brave Search API error: 403 Forbidden')

    vi.unstubAllGlobals()
  })

  it('returns mapped results on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          web: {
            results: [
              { title: 'Brave Result', url: 'https://example.com', description: 'Found it' },
            ],
          },
        }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { BRAVE_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual([
      { title: 'Brave Result', url: 'https://example.com', description: 'Found it' },
    ])

    vi.unstubAllGlobals()
  })

  it('handles missing web results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { BRAVE_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual([])

    vi.unstubAllGlobals()
  })
})
