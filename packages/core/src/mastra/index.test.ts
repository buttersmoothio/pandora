import datetime from '@pandora/tools-datetime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

// Register tools plugin and import after mocks
const { registerToolPackage, clearToolPackages } = await import('../tools')
const { getMastra, clearMastraCache } = await import('./index')

describe('getMastra', () => {
  beforeEach(() => {
    registerToolPackage(datetime)
  })

  afterEach(() => {
    clearMastraCache()
    clearToolPackages()
    mockMastraConstructor.mockClear()
  })

  it('creates Mastra with operator agent', async () => {
    const mastra = await getMastra({})
    const operator = mastra.getAgent('operator') as { id: string; name: string }
    expect(operator.id).toBe('operator')
    expect(operator.name).toBe('Pandora')
  })

  it('passes storage and logger to Mastra constructor', async () => {
    await getMastra({})
    const config = mockMastraConstructor.mock.calls[0][0]
    expect(config.storage.id).toBe('test-storage')
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
  beforeEach(() => {
    registerToolPackage(datetime)
  })

  afterEach(() => {
    clearMastraCache()
    clearToolPackages()
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
