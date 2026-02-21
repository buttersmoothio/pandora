import libsql from '@pandora/storage-libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearStorageCache,
  clearStorageProviders,
  getStorage,
  registerStorageProvider,
} from './index'

describe('getStorage', () => {
  beforeEach(() => {
    registerStorageProvider(libsql)
  })

  afterEach(async () => {
    await clearStorageCache()
    clearStorageProviders()
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

  it('throws for unregistered provider with helpful message', async () => {
    await expect(getStorage({ STORAGE_PROVIDER: 'unknown' })).rejects.toThrow(/not registered/)
  })

  it('caches storage instance in server mode', async () => {
    const storage1 = await getStorage(testEnv)
    const storage2 = await getStorage(testEnv)
    expect(storage1.mastra).toBe(storage2.mastra)
    expect(storage1.config).toBe(storage2.config)
  })

  it('clears cache correctly', async () => {
    const storage1 = await getStorage(testEnv)
    await clearStorageCache()
    const storage2 = await getStorage(testEnv)
    expect(storage1.mastra).not.toBe(storage2.mastra)
  })
})

describe('registerStorageProvider', () => {
  afterEach(() => {
    clearStorageProviders()
  })

  it('rejects plugins with incompatible schema version', () => {
    expect(() =>
      registerStorageProvider({ id: 'bad', schemaVersion: 99, factory: async () => ({}) as never }),
    ).toThrow(/schema v99/)
  })
})
