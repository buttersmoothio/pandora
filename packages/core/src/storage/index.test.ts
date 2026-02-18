import { afterEach, describe, expect, it } from 'vitest'
import { clearStorageCache, getStorage } from './index'

describe('getStorage', () => {
  afterEach(() => {
    clearStorageCache()
  })

  // Use in-memory DB for tests to avoid filesystem dependencies
  const testEnv = { DATABASE_URL: ':memory:' }

  it('creates storage with both mastra and config stores', async () => {
    const { mastra, config } = await getStorage(testEnv)
    expect(mastra).toBeDefined()
    expect(config).toBeDefined()
    expect(typeof config.get).toBe('function')
    expect(typeof config.set).toBe('function')
    expect(typeof config.delete).toBe('function')
  })

  it('throws for unknown provider with helpful message', async () => {
    await expect(getStorage({ STORAGE_PROVIDER: 'unknown' })).rejects.toThrow(
      /@pandora\/storage-unknown/,
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
