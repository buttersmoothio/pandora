import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisConfigStore } from './kv'

const testConfig = {
  identity: { name: 'Test' },
  models: { default: { provider: 'anthropic', model: 'test' } },
}

describe('RedisConfigStore', () => {
  let store: RedisConfigStore
  let redis: {
    get: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    del: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    redis = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    }
    store = new RedisConfigStore(redis)
  })

  describe('get', () => {
    it('returns null when key does not exist', async () => {
      const result = await store.get()
      expect(result).toBeNull()
      expect(redis.get).toHaveBeenCalledWith('pandora:config')
    })

    it('parses JSON string value', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(testConfig))
      const result = await store.get()
      expect(result).toEqual(testConfig)
    })

    it('returns object directly (auto-deserialized by Upstash)', async () => {
      redis.get.mockResolvedValueOnce(testConfig)
      const result = await store.get()
      expect(result).toEqual(testConfig)
    })

    it('returns null for empty string', async () => {
      redis.get.mockResolvedValueOnce('')
      const result = await store.get()
      expect(result).toBeNull()
    })
  })

  describe('set', () => {
    it('stores stringified config', async () => {
      await store.set(testConfig)
      expect(redis.set).toHaveBeenCalledWith('pandora:config', JSON.stringify(testConfig))
    })
  })

  describe('delete', () => {
    it('deletes the config key', async () => {
      await store.delete()
      expect(redis.del).toHaveBeenCalledWith('pandora:config')
    })
  })
})
