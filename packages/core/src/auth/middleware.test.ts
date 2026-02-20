import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AuthStore, PasswordCredential, RefreshToken, Session } from './auth-store'
import { authMiddleware } from './middleware'

const futureDate = new Date(Date.now() + 86400000).toISOString()

const testCredential: PasswordCredential = {
  hash: 'testhash==',
  salt: 'testsalt==',
  iterations: 600000,
  createdAt: '2024-01-01T00:00:00.000Z',
}

function createMockStore(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    init: vi.fn(async () => {}),
    getCredential: vi.fn(async () => testCredential),
    setCredential: vi.fn(async () => {}),
    setCredentialIfNotExists: vi.fn(async () => true),
    createSession: vi.fn(async () => {}),
    getSession: vi.fn(
      async (hash: string): Promise<Session | null> => ({
        tokenHash: hash,
        expiresAt: futureDate,
        createdAt: '2024-01-01T00:00:00.000Z',
      }),
    ),
    deleteSession: vi.fn(async () => {}),
    deleteAllSessions: vi.fn(async () => {}),
    listSessions: vi.fn(async () => []),
    createRefreshToken: vi.fn(async () => {}),
    getRefreshToken: vi.fn(async (): Promise<RefreshToken | null> => null),
    deleteRefreshToken: vi.fn(async () => {}),
    deleteAllRefreshTokens: vi.fn(async () => {}),
    markRefreshTokenUsed: vi.fn(async () => {}),
    ...overrides,
  }
}

function createApp(store: AuthStore) {
  const app = new Hono()
  app.use(
    '/api/*',
    authMiddleware(async () => store),
  )
  app.get('/', (c) => c.json({ ok: true }))
  app.get('/api/test', (c) => c.json({ ok: true }))
  return app
}

describe('authMiddleware', () => {
  it('passes through public path /', async () => {
    const store = createMockStore()
    const app = createApp(store)

    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(store.getCredential).not.toHaveBeenCalled()
  })

  it('returns 403 when no credential is set (setup mode)', async () => {
    const store = createMockStore({
      getCredential: vi.fn(async () => null),
    })
    const app = createApp(store)

    const res = await app.request('/api/test')
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('setup_required')
  })

  it('returns 401 when no token is provided', async () => {
    const store = createMockStore()
    const app = createApp(store)

    const res = await app.request('/api/test')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unauthorized')
  })

  it('returns 401 for invalid token (session not found)', async () => {
    const store = createMockStore({
      getSession: vi.fn(async () => null),
    })
    const app = createApp(store)

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer invalidtoken123456789012345678901234567890ab' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session verification throws', async () => {
    const store = createMockStore({
      getSession: vi.fn(async () => {
        throw new Error('db error')
      }),
    })
    const app = createApp(store)

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer sometoken12345678901234567890123456789012ab' },
    })
    expect(res.status).toBe(401)
  })

  it('passes with valid Bearer token', async () => {
    const store = createMockStore()
    const app = createApp(store)

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer validtoken12345678901234567890123456789012ab' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('does not accept cookies (token-only auth)', async () => {
    const store = createMockStore()
    const app = createApp(store)

    // Only send cookie, no Bearer header
    const res = await app.request('/api/test', {
      headers: { Cookie: 'pandora_session=sometoken123' },
    })
    expect(res.status).toBe(401)
  })
})
