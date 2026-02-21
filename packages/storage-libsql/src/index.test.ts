import { describe, expect, it } from 'vitest'
import { createStorage } from './index'

describe('LibSQL storage', () => {
  const testEnv = { DATABASE_URL: ':memory:' }

  describe('createStorage', () => {
    it('returns mastra and config stores', async () => {
      const { mastra, config } = await createStorage(testEnv)
      expect(mastra).toBeDefined()
      expect(mastra.id).toBe('pandora-libsql')
      expect(config).toBeDefined()
      expect(typeof config.get).toBe('function')
      expect(typeof config.set).toBe('function')
      expect(typeof config.delete).toBe('function')
    })
  })

  describe('ConfigStore integration', () => {
    it('can store and retrieve config', async () => {
      const { config } = await createStorage(testEnv)
      if (config.init) {
        await config.init()
      }

      // Initially empty
      const initial = await config.get()
      expect(initial).toBeNull()

      // Store config
      const testConfig = {
        identity: { name: 'Test' },
        personality: { systemPrompt: 'You are a test agent.' },
        models: { operator: { provider: 'test', model: 'test' } },
        channels: { web: { enabled: true } },
        tools: { 'current-time': { enabled: true } },
      }
      await config.set(testConfig)

      const retrieved = await config.get()
      expect(retrieved).toEqual(testConfig)
    })

    it('can delete config', async () => {
      const { config } = await createStorage(testEnv)
      if (config.init) {
        await config.init()
      }

      const testConfig = {
        identity: { name: 'ToDelete' },
        personality: { systemPrompt: 'Delete me.' },
        models: { operator: { provider: 'test', model: 'test' } },
        channels: {},
        tools: {},
      }
      await config.set(testConfig)
      await config.delete()

      const deleted = await config.get()
      expect(deleted).toBeNull()
    })
  })
})
