import { describe, expect, it, vi } from 'vitest'
import { ScopedOAuthStorage } from '../oauth-adapter'
import type { McpOAuthStore } from '../oauth-store'

function createMockStore(): McpOAuthStore {
  return {
    init: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }
}

describe('ScopedOAuthStorage', () => {
  it('get prefixes key with serverId', async () => {
    const store = createMockStore()
    vi.mocked(store.get).mockResolvedValue('token-value')
    const scoped = new ScopedOAuthStorage(store, 'server-1')

    const result = await scoped.get('tokens')

    expect(store.get).toHaveBeenCalledWith('server-1:tokens')
    expect(result).toBe('token-value')
  })

  it('get returns undefined when store returns undefined', async () => {
    const store = createMockStore()
    vi.mocked(store.get).mockResolvedValue(undefined)
    const scoped = new ScopedOAuthStorage(store, 'server-1')

    const result = await scoped.get('missing')
    expect(result).toBeUndefined()
  })

  it('set prefixes key with serverId', async () => {
    const store = createMockStore()
    const scoped = new ScopedOAuthStorage(store, 'server-2')

    await scoped.set('code_verifier', 'abc123')

    expect(store.set).toHaveBeenCalledWith('server-2:code_verifier', 'abc123')
  })

  it('delete prefixes key with serverId', async () => {
    const store = createMockStore()
    const scoped = new ScopedOAuthStorage(store, 'server-3')

    await scoped.delete('tokens')

    expect(store.delete).toHaveBeenCalledWith('server-3:tokens')
  })

  it('different server IDs scope independently', async () => {
    const store = createMockStore()
    const scopedA = new ScopedOAuthStorage(store, 'a')
    const scopedB = new ScopedOAuthStorage(store, 'b')

    await scopedA.set('tokens', 'token-a')
    await scopedB.set('tokens', 'token-b')

    expect(store.set).toHaveBeenCalledWith('a:tokens', 'token-a')
    expect(store.set).toHaveBeenCalledWith('b:tokens', 'token-b')
  })
})
