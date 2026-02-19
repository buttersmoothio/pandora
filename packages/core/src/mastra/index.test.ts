import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock Agent
vi.mock('@mastra/core/agent', () => ({
  Agent: class MockAgent {
    id: string
    name: string
    constructor(config: Record<string, unknown>) {
      this.id = config.id as string
      this.name = config.name as string
    }
  },
}))

// Mock Mastra
const mockMastraConstructor = vi.fn()
vi.mock('@mastra/core', () => ({
  Mastra: class MockMastra {
    private agents: Record<string, unknown>
    constructor(config: Record<string, unknown>) {
      mockMastraConstructor(config)
      this.agents = (config.agents ?? {}) as Record<string, unknown>
    }
    getAgent(id: string) {
      return this.agents[id]
    }
  },
}))

// Mock storage
vi.mock('../storage', () => {
  const mockConfigStore = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  const mockMastraStorage = { id: 'test-storage', init: vi.fn() }
  return {
    getStorage: vi.fn().mockResolvedValue({
      mastra: mockMastraStorage,
      config: mockConfigStore,
    }),
  }
})

// Import after mocks
const { getMastra, clearMastraCache } = await import('./index')

describe('getMastra', () => {
  afterEach(() => {
    clearMastraCache()
    mockMastraConstructor.mockClear()
  })

  it('returns a Mastra instance', async () => {
    const mastra = await getMastra({})
    expect(mastra).toBeDefined()
    expect(mastra.getAgent).toBeDefined()
  })

  it('creates Mastra with operator agent', async () => {
    const mastra = await getMastra({})
    const operator = mastra.getAgent('operator')
    expect(operator).toBeDefined()
  })

  it('passes storage to Mastra constructor', async () => {
    await getMastra({})
    const config = mockMastraConstructor.mock.calls[0][0]
    expect(config.storage).toBeDefined()
    expect(config.storage.id).toBe('test-storage')
  })

  it('passes tools to Mastra constructor', async () => {
    await getMastra({})
    const config = mockMastraConstructor.mock.calls[0][0]
    expect(config.tools).toBeDefined()
    expect(config.tools['current-time']).toBeDefined()
  })

  it('passes logger instance', async () => {
    await getMastra({})
    const config = mockMastraConstructor.mock.calls[0][0]
    expect(config.logger).toBeTruthy()
    expect(config.logger.info).toBeTypeOf('function')
  })

  it('caches instance in server mode', async () => {
    await getMastra({})
    await getMastra({})
    // Should only construct once due to caching
    expect(mockMastraConstructor).toHaveBeenCalledTimes(1)
  })

  it('creates fresh instance after cache clear', async () => {
    await getMastra({})
    clearMastraCache()
    await getMastra({})
    expect(mockMastraConstructor).toHaveBeenCalledTimes(2)
  })
})

describe('clearMastraCache', () => {
  afterEach(() => {
    clearMastraCache()
    mockMastraConstructor.mockClear()
  })

  it('forces re-creation on next getMastra call', async () => {
    await getMastra({})
    expect(mockMastraConstructor).toHaveBeenCalledTimes(1)

    clearMastraCache()
    await getMastra({})
    expect(mockMastraConstructor).toHaveBeenCalledTimes(2)
  })
})
