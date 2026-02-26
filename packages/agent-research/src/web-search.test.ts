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

  it('delegates to resolveSearchTools and passes through tools and alerts', async () => {
    mockResolve.mockResolvedValue({
      tools: { webSearch: { type: 'tavily' } } as never,
      alerts: [{ level: 'info', message: 'Using Tavily for web search' }],
    })

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
    expect(result).toEqual({
      tools: { webSearch: { type: 'tavily' } },
      alerts: [{ level: 'info', message: 'Using Tavily for web search' }],
    })
  })

  it('returns null tools with warning when no capability', async () => {
    mockResolve.mockResolvedValue({
      tools: null,
      alerts: [{ level: 'warning', message: 'No search backend available' }],
    })

    const result = await getTools(ctx())
    expect(result).toEqual({
      tools: null,
      alerts: [{ level: 'warning', message: 'No search backend available' }],
    })
  })

  it('passes undefined preferred when searchBackend is not set', async () => {
    mockResolve.mockResolvedValue({ tools: {}, alerts: [] })

    await getTools(ctx())

    expect(mockResolve).toHaveBeenCalledWith({
      model: 'anthropic/claude-sonnet-4-20250514',
      preferred: undefined,
      env: {},
    })
  })
})
