import { afterAll, describe, expect, it } from 'vitest'
import type { StorageResult } from './index'
import { createStorage } from './index'

describe('createStorage', () => {
  let storage: StorageResult

  it('creates storage with all required stores', async () => {
    storage = await createStorage({ DATABASE_URL: ':memory:' })
    expect(storage.mastra).toBeDefined()
    expect(storage.config).toBeDefined()
    expect(storage.auth).toBeDefined()
    expect(storage.inbox).toBeDefined()
    expect(storage.mcpOAuth).toBeDefined()
  })

  it('config store supports get/set cycle', async () => {
    storage = await createStorage({ DATABASE_URL: ':memory:' })
    const initial = await storage.config.get()
    expect(initial).toBeNull()

    await storage.config.set({ identity: { name: 'Test' } } as never)
    const saved = (await storage.config.get()) as Record<string, Record<string, unknown>> | null
    expect(saved?.identity.name).toBe('Test')
  })

  it('inbox store supports add/get/list cycle', async () => {
    storage = await createStorage({ DATABASE_URL: ':memory:' })
    const msg = await storage.inbox.add({
      subject: 'Test',
      body: 'Body',
      threadId: null,
      destination: 'web',
      status: 'sent',
    })
    expect(msg.id).toBeDefined()
    expect(msg.subject).toBe('Test')

    const fetched = await storage.inbox.get(msg.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.subject).toBe('Test')

    const list = await storage.inbox.list()
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  it('provides close function', async () => {
    storage = await createStorage({ DATABASE_URL: ':memory:' })
    expect(typeof storage.close).toBe('function')
  })

  afterAll(async () => {
    if (storage?.close) {
      await storage.close()
    }
  })
})
