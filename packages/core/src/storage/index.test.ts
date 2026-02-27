import { factory as libsqlFactory } from '@pandora/storage-libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoragePlugin } from './index'
import { clearStorageCache, clearStoragePlugins, getStorage, registerStoragePlugin } from './index'

const libsql: StoragePlugin = {
  id: 'storage-libsql',
  name: 'SQLite',
  schemaVersion: 1,
  envVars: [],
  factory: libsqlFactory,
}

describe('getStorage', () => {
  beforeEach(() => {
    registerStoragePlugin(libsql)
  })

  afterEach(async () => {
    await clearStorageCache()
    clearStoragePlugins()
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

describe('registerStoragePlugin', () => {
  afterEach(() => {
    clearStoragePlugins()
  })

  it('rejects plugins with incompatible schema version', () => {
    expect(() =>
      registerStoragePlugin({
        id: 'bad',
        name: 'Bad',
        schemaVersion: 99,
        envVars: [],
        factory: async () => ({}) as never,
      }),
    ).toThrow(/schema v99/)
  })
})
