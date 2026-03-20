import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthStore, RefreshToken, Session } from '../auth-store'
import { hashPassword, hashToken } from '../crypto'
import { createAuthRoutes } from '../routes'
import { createTokenPair } from '../session'

const futureDate: string = new Date(Date.now() + 86400000).toISOString()

function createMockStore(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    init: vi.fn(async () => {}),
    getCredential: vi.fn(async () => null),
    setCredential: vi.fn(async () => {}),
    setCredentialIfNotExists: vi.fn(async () => true),
    createSession: vi.fn(async () => {}),
    getSession: vi.fn(async (): Promise<Session | null> => null),
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

function createApp(store: AuthStore): Hono {
  const app = new Hono()
  app.route(
    '/api/auth',
    createAuthRoutes(async () => store),
  )
  return app
}

function jsonPost(path: string, body: unknown, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('auth routes', () => {
  describe('POST /api/auth/setup', () => {
    it('returns 400 for short password', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/setup', { password: 'short' }))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('at least 8')
    })

    it('returns 400 for missing password', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/setup', {}))
      expect(res.status).toBe(400)
    })

    it('returns 201 with tokens on success', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(
        jsonPost('/api/auth/setup', { password: 'mysecurepassword123' }),
      )
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        token: string
        refreshToken: string
        expiresAt: string
        refreshExpiresAt: string
      }
      expect(body.token).toBeTruthy()
      expect(body.refreshToken).toBeTruthy()
      expect(body.expiresAt).toBeTruthy()
      expect(body.refreshExpiresAt).toBeTruthy()
    })

    it('returns 201 and does not set cookies', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(
        jsonPost('/api/auth/setup', { password: 'mysecurepassword123' }),
      )
      expect(res.status).toBe(201)
      expect(res.headers.get('Set-Cookie')).toBeNull()
    })

    it('returns 409 when already setup (race condition safe)', async () => {
      const store = createMockStore({
        setCredentialIfNotExists: vi.fn(async () => false),
      })
      const app = createApp(store)

      const res = await app.request(
        jsonPost('/api/auth/setup', { password: 'mysecurepassword123' }),
      )
      expect(res.status).toBe(409)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('already_setup')
    })
  })

  describe('POST /api/auth/login', () => {
    it('returns 403 when not setup', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/login', { password: 'somepassword12345' }))
      expect(res.status).toBe(403)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('setup_required')
    })

    it('returns 401 for wrong password', async () => {
      const hashed = await hashPassword('correctpassword1')
      const store = createMockStore({
        getCredential: vi.fn(async () => ({
          ...hashed,
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      })
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/login', { password: 'wrongpassword123' }))
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_credentials')
    })

    it('returns 200 with tokens on valid login', async () => {
      const password = 'correctpassword1'
      const hashed = await hashPassword(password)
      const store = createMockStore({
        getCredential: vi.fn(async () => ({
          ...hashed,
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      })
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/login', { password }))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { token: string; refreshToken: string }
      expect(body.token).toBeTruthy()
      expect(body.refreshToken).toBeTruthy()
    })

    it('does not set cookies on login', async () => {
      const password = 'correctpassword1'
      const hashed = await hashPassword(password)
      const store = createMockStore({
        getCredential: vi.fn(async () => ({
          ...hashed,
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      })
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/login', { password }))
      expect(res.status).toBe(200)
      expect(res.headers.get('Set-Cookie')).toBeNull()
    })

    it('returns 400 for missing password', async () => {
      const hashed = await hashPassword('somepassword1234')
      const store = createMockStore({
        getCredential: vi.fn(async () => ({
          ...hashed,
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      })
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/login', {}))
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('deletes session for bearer token', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(
        jsonPost('/api/auth/logout', {}, { Authorization: 'Bearer testtoken123' }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { success: boolean }
      expect(body.success).toBe(true)
      expect(store.deleteSession).toHaveBeenCalled()
    })

    it('succeeds even without a token', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/logout', {}))
      expect(res.status).toBe(200)
      expect(store.deleteSession).not.toHaveBeenCalled()
    })

    it('does not set cookies on logout', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(
        jsonPost('/api/auth/logout', {}, { Authorization: 'Bearer testtoken123' }),
      )
      expect(res.headers.get('Set-Cookie')).toBeNull()
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('returns 400 when no refresh token provided', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/refresh', {}))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('refresh_token_required')
    })

    it('returns 401 for invalid refresh token', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request(jsonPost('/api/auth/refresh', { refreshToken: 'invalidtoken' }))
      expect(res.status).toBe(401)
    })

    it('returns new tokens on successful rotation', async () => {
      // Create a real token pair to get a valid refresh token
      const store = createMockStore()
      const pair = await createTokenPair(store, {})
      const refreshHash = await hashToken(pair.refreshToken)

      // Mock the refresh token lookup
      store.getRefreshToken = vi.fn(async (hash: string) => {
        if (hash === refreshHash) {
          return {
            tokenHash: refreshHash,
            sessionHash: 'session_hash',
            expiresAt: futureDate,
            createdAt: '2024-01-01T00:00:00.000Z',
            used: false,
          }
        }
        return null
      })

      const app = createApp(store)
      const res = await app.request(
        jsonPost('/api/auth/refresh', { refreshToken: pair.refreshToken }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { token: string; refreshToken: string }
      expect(body.token).toBeTruthy()
      expect(body.refreshToken).toBeTruthy()
    })

    it('returns 401 on refresh token reuse', async () => {
      const store = createMockStore()
      const pair = await createTokenPair(store, {})
      const refreshHash = await hashToken(pair.refreshToken)

      // Mark as already used
      store.getRefreshToken = vi.fn(async (hash: string) => {
        if (hash === refreshHash) {
          return {
            tokenHash: refreshHash,
            sessionHash: 'session_hash',
            expiresAt: futureDate,
            createdAt: '2024-01-01T00:00:00.000Z',
            used: true,
          }
        }
        return null
      })

      const app = createApp(store)
      const res = await app.request(
        jsonPost('/api/auth/refresh', { refreshToken: pair.refreshToken }),
      )
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('refresh_token_reused')
      // Should have wiped all sessions (reuse detection)
      expect(store.deleteAllSessions).toHaveBeenCalled()
      expect(store.deleteAllRefreshTokens).toHaveBeenCalled()
    })
  })

  describe('POST /api/auth/change-password', () => {
    let store: AuthStore
    let app: Hono
    const password = 'oldpassword12345'

    beforeEach(async () => {
      const hashed = await hashPassword(password)
      store = createMockStore({
        getCredential: vi.fn(async () => ({
          ...hashed,
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      })
      app = createApp(store)
    })

    it('returns 400 for missing fields', async () => {
      const res = await app.request(
        jsonPost('/api/auth/change-password', { currentPassword: password }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 401 for wrong current password', async () => {
      const res = await app.request(
        jsonPost('/api/auth/change-password', {
          currentPassword: 'wrongpassword123',
          newPassword: 'newpassword12345',
        }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 400 for short new password', async () => {
      const res = await app.request(
        jsonPost('/api/auth/change-password', {
          currentPassword: password,
          newPassword: 'short',
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 200 with new tokens on success', async () => {
      const res = await app.request(
        jsonPost('/api/auth/change-password', {
          currentPassword: password,
          newPassword: 'newpassword12345',
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { token: string; refreshToken: string }
      expect(body.token).toBeTruthy()
      expect(body.refreshToken).toBeTruthy()
      expect(store.deleteAllSessions).toHaveBeenCalled()
      expect(store.deleteAllRefreshTokens).toHaveBeenCalled()
      expect(store.setCredential).toHaveBeenCalled()
    })
  })

  describe('GET /api/auth/sessions', () => {
    it('returns session list', async () => {
      const store = createMockStore({
        listSessions: vi.fn(async () => [
          {
            tokenHash: 'hash1',
            expiresAt: futureDate,
            createdAt: '2024-01-01T00:00:00.000Z',
            userAgent: 'test',
            ip: '1.2.3.4',
          },
        ]),
      })
      const app = createApp(store)

      const res = await app.request('/api/auth/sessions')
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: unknown[] }
      expect(body.data).toHaveLength(1)
    })
  })

  describe('DELETE /api/auth/sessions/:id', () => {
    it('returns 404 for nonexistent session', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request('/api/auth/sessions/nonexistent', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })

    it('deletes session and returns success', async () => {
      const store = createMockStore({
        getSession: vi.fn(async () => ({
          tokenHash: 'target_hash',
          expiresAt: futureDate,
          createdAt: '2024-01-01T00:00:00.000Z',
        })),
      })
      const app = createApp(store)

      const res = await app.request('/api/auth/sessions/target_hash', { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { id: string; loggedOut: boolean }
      expect(body.id).toBe('target_hash')
      expect(store.deleteSession).toHaveBeenCalledWith('target_hash')
    })
  })

  describe('DELETE /api/auth/sessions', () => {
    it('deletes all sessions and refresh tokens', async () => {
      const store = createMockStore()
      const app = createApp(store)

      const res = await app.request('/api/auth/sessions', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(store.deleteAllSessions).toHaveBeenCalled()
      expect(store.deleteAllRefreshTokens).toHaveBeenCalled()
    })
  })
})
