import { describe, expect, it, vi } from 'vitest'
import { tools } from './index'

const noopLogger: {
  log: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
} = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

describe('exa-search tool definition', () => {
  const tool = tools[0]
  // biome-ignore lint/suspicious/noExplicitAny: test assertion on JSON Schema
  const params = tool.parameters as any

  it('exports a single tool', () => {
    expect(tools).toHaveLength(1)
  })

  it('has correct id and name', () => {
    expect(tool.id).toBe('exa_search')
    expect(tool.name).toBe('Exa Search')
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
    expect(params.properties.num_results).toBeDefined()
  })

  it('throws on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }),
    )

    await expect(
      tool.execute({ query: 'test' }, { env: { EXA_API_KEY: 'key' }, logger: noopLogger }),
    ).rejects.toThrow('Exa API error: 500 Server Error')

    vi.unstubAllGlobals()
  })

  it('returns mapped results on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: 'Exa Result', url: 'https://example.com', text: 'Content here' }],
        }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { EXA_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual([
      { title: 'Exa Result', url: 'https://example.com', description: 'Content here' },
    ])

    vi.unstubAllGlobals()
  })

  it('handles missing text field in results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: 'No Text', url: 'https://example.com' }],
        }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { EXA_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual([{ title: 'No Text', url: 'https://example.com', description: '' }])

    vi.unstubAllGlobals()
  })
})
