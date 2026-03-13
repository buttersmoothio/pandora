import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRefreshToken,
  clearToken,
  clearTokens,
  client,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
  storeTokens,
} from '../api'

// jsdom may not provide a full localStorage — stub it
const storage: Map<string, string> = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
})

beforeEach(() => {
  storage.clear()
})

afterEach(() => {
  storage.clear()
})

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

describe('token storage', () => {
  it('getToken returns null when no token is set', () => {
    expect(getToken()).toBeNull()
  })

  it('setToken / getToken round-trip', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
  })

  it('clearToken removes the token', () => {
    setToken('abc')
    clearToken()
    expect(getToken()).toBeNull()
  })

  it('getRefreshToken returns null when no token is set', () => {
    expect(getRefreshToken()).toBeNull()
  })

  it('setRefreshToken / getRefreshToken round-trip', () => {
    setRefreshToken('refresh-abc')
    expect(getRefreshToken()).toBe('refresh-abc')
  })

  it('clearRefreshToken removes the refresh token', () => {
    setRefreshToken('refresh-abc')
    clearRefreshToken()
    expect(getRefreshToken()).toBeNull()
  })

  it('storeTokens sets both tokens', () => {
    storeTokens({ token: 'access-1', refreshToken: 'refresh-1' })
    expect(getToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('clearTokens removes both tokens', () => {
    storeTokens({ token: 'access-1', refreshToken: 'refresh-1' })
    clearTokens()
    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

describe('client', () => {
  it('exports a PandoraClient instance', () => {
    expect(client).toBeDefined()
    expect(client.auth).toBeDefined()
    expect(client.threads).toBeDefined()
    expect(client.config).toBeDefined()
    expect(client.plugins).toBeDefined()
    expect(client.mcpServers).toBeDefined()
    expect(client.models).toBeDefined()
    expect(client.schedule).toBeDefined()
    expect(client.inbox).toBeDefined()
    expect(client.memory).toBeDefined()
    expect(client.chat).toBeDefined()
    expect(typeof client.health).toBe('function')
  })
})
