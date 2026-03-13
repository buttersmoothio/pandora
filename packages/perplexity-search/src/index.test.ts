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

describe('perplexity-search tool definition', () => {
  const tool = tools[0]
  // biome-ignore lint/suspicious/noExplicitAny: test assertion on JSON Schema
  const params = tool.parameters as any

  it('exports a single tool', () => {
    expect(tools).toHaveLength(1)
  })

  it('has correct id and name', () => {
    expect(tool.id).toBe('perplexity_search')
    expect(tool.name).toBe('Perplexity Search')
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
  })

  it('throws on API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' }),
    )

    await expect(
      tool.execute({ query: 'test' }, { env: { PERPLEXITY_API_KEY: 'key' }, logger: noopLogger }),
    ).rejects.toThrow('Perplexity API error: 429 Too Many Requests')

    vi.unstubAllGlobals()
  })

  it('returns answer with citations on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'The answer is 42.' } }],
          citations: ['https://source1.com', 'https://source2.com'],
        }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { PERPLEXITY_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual({
      answer: 'The answer is 42.',
      citations: [
        { title: 'Source 1', url: 'https://source1.com' },
        { title: 'Source 2', url: 'https://source2.com' },
      ],
    })

    vi.unstubAllGlobals()
  })

  it('handles missing citations and content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
      }),
    )

    const result = await tool.execute(
      { query: 'test' },
      { env: { PERPLEXITY_API_KEY: 'key' }, logger: noopLogger },
    )
    expect(result).toEqual({ answer: '', citations: [] })

    vi.unstubAllGlobals()
  })
})
