import { afterEach, describe, expect, it } from 'vitest'
import { clearStorageCache, getStorage, getSupportedProviders } from '../src/storage'

describe('Storage', () => {
  afterEach(() => {
    clearStorageCache()
  })

  describe('getSupportedProviders', () => {
    it('returns list of supported providers', () => {
      const providers = getSupportedProviders()
      expect(providers).toBeInstanceOf(Array)
      expect(providers.length).toBeGreaterThan(0)
      expect(providers).toContain('libsql')
      expect(providers).toContain('postgres')
      expect(providers).toContain('mongodb')
    })
  })

  describe('getStorage', () => {
    // Use in-memory DB for tests to avoid filesystem dependencies
    const testEnv = { DATABASE_URL: ':memory:' }

    it('creates LibSQL storage with both mastra and config stores', async () => {
      const { mastra, config } = await getStorage(testEnv)
      expect(mastra).toBeDefined()
      expect(mastra.id).toBe('pandora-libsql')
      expect(config).toBeDefined()
      expect(typeof config.get).toBe('function')
      expect(typeof config.set).toBe('function')
      expect(typeof config.delete).toBe('function')
    })

    it('throws for unknown provider', async () => {
      await expect(getStorage({ STORAGE_PROVIDER: 'unknown' })).rejects.toThrow(
        /Unknown storage provider.*unknown/,
      )
    })

    it('caches storage instance in server mode', async () => {
      const storage1 = await getStorage(testEnv)
      const storage2 = await getStorage(testEnv)
      expect(storage1.mastra).toBe(storage2.mastra)
      expect(storage1.config).toBe(storage2.config)
    })

    it('clears cache correctly', async () => {
      const storage1 = await getStorage(testEnv)
      clearStorageCache()
      const storage2 = await getStorage(testEnv)
      expect(storage1.mastra).not.toBe(storage2.mastra)
    })
  })

  describe('ConfigStore integration', () => {
    const testEnv = { DATABASE_URL: ':memory:' }

    it('can store and retrieve config', async () => {
      const { config } = await getStorage(testEnv)

      // Initially empty
      const initial = await config.get()
      expect(initial).toBeNull()

      // Store config
      const testConfig = {
        identity: { name: 'Test', description: 'Test', version: '1.0.0' },
        personality: { traits: ['test'] },
        models: { default: { provider: 'test', model: 'test' } },
        memory: { enabled: true, maxThreads: 10, maxMessagesPerThread: 100 },
        channels: {
          telegram: { enabled: false },
          discord: { enabled: false },
          slack: { enabled: false },
          web: { enabled: true },
        },
        tools: { enabled: [], disabled: [], mcp: { servers: [] } },
        schedule: { tasks: [] },
        security: {
          allowedOrigins: ['*'],
          rateLimiting: { enabled: false, requestsPerMinute: 60 },
          apiKeys: { required: false },
        },
      }
      await config.set(testConfig)

      // Retrieve from same store (in-memory doesn't persist across instances)
      const retrieved = await config.get()
      expect(retrieved).toEqual(testConfig)
    })

    it('can delete config', async () => {
      const { config } = await getStorage(testEnv)

      const testConfig = {
        identity: { name: 'ToDelete', description: 'Delete me', version: '1.0.0' },
        personality: { traits: [] },
        models: { default: { provider: 'test', model: 'test' } },
        memory: { enabled: true, maxThreads: 10, maxMessagesPerThread: 100 },
        channels: {
          telegram: { enabled: false },
          discord: { enabled: false },
          slack: { enabled: false },
          web: { enabled: true },
        },
        tools: { enabled: [], disabled: [], mcp: { servers: [] } },
        schedule: { tasks: [] },
        security: {
          allowedOrigins: ['*'],
          rateLimiting: { enabled: false, requestsPerMinute: 60 },
          apiKeys: { required: false },
        },
      }
      await config.set(testConfig)
      await config.delete()

      const deleted = await config.get()
      expect(deleted).toBeNull()
    })
  })
})
