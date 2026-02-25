import type { GetToolsContext } from '@pandora/core/agents'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock resolveSearchTools from tools-websearch
vi.mock('@pandora/tools-websearch', () => ({
  resolveSearchTools: vi.fn(),
}))

const { resolveSearchTools } = await import('@pandora/tools-websearch')
const mockResolve = vi.mocked(resolveSearchTools)

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

  it('delegates to resolveSearchTools with model, preferred, and env', async () => {
    mockResolve.mockResolvedValue({ webSearch: { type: 'tavily' } } as never)

    const result = await getTools(
      ctx({
        pluginConfig: { enabled: true, searchBackend: 'tavily' },
        env: { TAVILY_API_KEY: 'key' },
      }),
    )

    expect(mockResolve).toHaveBeenCalledWith({
      model: 'anthropic/claude-sonnet-4-20250514',
      preferred: 'tavily',
      env: { TAVILY_API_KEY: 'key' },
    })
    expect(result).toEqual({ webSearch: { type: 'tavily' } })
  })

  it('returns null when resolveSearchTools returns null (no capability)', async () => {
    mockResolve.mockResolvedValue(null)

    const result = await getTools(ctx())
    expect(result).toBeNull()
  })

  it('passes undefined preferred when searchBackend is not set', async () => {
    mockResolve.mockResolvedValue({})

    await getTools(ctx())

    expect(mockResolve).toHaveBeenCalledWith({
      model: 'anthropic/claude-sonnet-4-20250514',
      preferred: undefined,
      env: {},
    })
  })
})
