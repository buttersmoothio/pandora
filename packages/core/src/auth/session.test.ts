import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthStore, RefreshToken, Session } from './auth-store'
import { hashToken } from './crypto'
import { createTokenPair, rotateTokens, verifySessionToken } from './session'

function createMockStore(): AuthStore {
  const sessions = new Map<string, Session>()
  const refreshTokens = new Map<string, RefreshToken>()

  return {
    init: vi.fn(async () => {}),
    getCredential: vi.fn(async () => null),
    setCredential: vi.fn(async () => {}),
    setCredentialIfNotExists: vi.fn(async () => true),
    createSession: vi.fn(async (session: Session) => {
      sessions.set(session.tokenHash, session)
    }),
    getSession: vi.fn(async (tokenHash: string) => {
      const session = sessions.get(tokenHash)
      if (!session) return null
      if (new Date(session.expiresAt) <= new Date()) {
        sessions.delete(tokenHash)
        return null
      }
      return session
    }),
    deleteSession: vi.fn(async (tokenHash: string) => {
      sessions.delete(tokenHash)
    }),
    deleteAllSessions: vi.fn(async () => {
      sessions.clear()
    }),
    listSessions: vi.fn(async () => [...sessions.values()]),
    createRefreshToken: vi.fn(async (token: RefreshToken) => {
      refreshTokens.set(token.tokenHash, token)
    }),
    getRefreshToken: vi.fn(async (tokenHash: string) => {
      return refreshTokens.get(tokenHash) ?? null
    }),
    deleteRefreshToken: vi.fn(async (tokenHash: string) => {
      refreshTokens.delete(tokenHash)
    }),
    deleteAllRefreshTokens: vi.fn(async () => {
      refreshTokens.clear()
    }),
    markRefreshTokenUsed: vi.fn(async (tokenHash: string) => {
      const token = refreshTokens.get(tokenHash)
      if (token) {
        token.used = true
        refreshTokens.set(tokenHash, token)
      }
    }),
  }
}

describe('session', () => {
  let store: AuthStore

  beforeEach(() => {
    store = createMockStore()
  })

  describe('createTokenPair', () => {
    it('creates access session and refresh token in store', async () => {
      const pair = await createTokenPair(store)

      expect(pair.accessToken).toBeTruthy()
      expect(pair.refreshToken).toBeTruthy()
      expect(pair.accessExpiresAt).toBeTruthy()
      expect(pair.refreshExpiresAt).toBeTruthy()

      expect(store.createSession).toHaveBeenCalledOnce()
      expect(store.createRefreshToken).toHaveBeenCalledOnce()
    })

    it('access token expires before refresh token', async () => {
      const pair = await createTokenPair(store)

      const accessExpiry = new Date(pair.accessExpiresAt).getTime()
      const refreshExpiry = new Date(pair.refreshExpiresAt).getTime()

      expect(refreshExpiry).toBeGreaterThan(accessExpiry)
    })

    it('passes metadata to both tokens', async () => {
      const meta = { userAgent: 'test-browser', ip: '10.0.0.1' }
      await createTokenPair(store, meta)

      const sessionCall = (store.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0]
      const refreshCall = (store.createRefreshToken as ReturnType<typeof vi.fn>).mock.calls[0][0]

      expect(sessionCall.userAgent).toBe('test-browser')
      expect(sessionCall.ip).toBe('10.0.0.1')
      expect(refreshCall.userAgent).toBe('test-browser')
      expect(refreshCall.ip).toBe('10.0.0.1')
    })

    it('access token is verifiable', async () => {
      const pair = await createTokenPair(store)
      const session = await verifySessionToken(store, pair.accessToken)
      expect(session).not.toBeNull()
    })
  })

  describe('verifySessionToken', () => {
    it('returns session for valid token', async () => {
      const pair = await createTokenPair(store)
      const session = await verifySessionToken(store, pair.accessToken)
      expect(session).not.toBeNull()
      expect(session?.expiresAt).toBe(pair.accessExpiresAt)
    })

    it('returns null for invalid token', async () => {
      const session = await verifySessionToken(store, 'invalid-token-data')
      expect(session).toBeNull()
    })
  })

  describe('rotateTokens', () => {
    it('returns new token pair from valid refresh token', async () => {
      const original = await createTokenPair(store)
      const newPair = await rotateTokens(store, original.refreshToken)

      expect(newPair.accessToken).toBeTruthy()
      expect(newPair.refreshToken).toBeTruthy()
      expect(newPair.accessToken).not.toBe(original.accessToken)
      expect(newPair.refreshToken).not.toBe(original.refreshToken)
    })

    it('marks old refresh token as used', async () => {
      const original = await createTokenPair(store)
      await rotateTokens(store, original.refreshToken)

      expect(store.markRefreshTokenUsed).toHaveBeenCalledOnce()
    })

    it('deletes old access session', async () => {
      const original = await createTokenPair(store)
      const oldAccessHash = await hashToken(original.accessToken)
      await rotateTokens(store, original.refreshToken)

      // The old session should be deleted
      expect(store.deleteSession).toHaveBeenCalledWith(oldAccessHash)
    })

    it('new access token is verifiable', async () => {
      const original = await createTokenPair(store)
      const newPair = await rotateTokens(store, original.refreshToken)

      const session = await verifySessionToken(store, newPair.accessToken)
      expect(session).not.toBeNull()
    })

    it('throws on invalid refresh token', async () => {
      await expect(rotateTokens(store, 'invalid-token-data')).rejects.toThrow(
        'invalid_refresh_token',
      )
    })

    it('throws on reused refresh token and invalidates all sessions', async () => {
      const original = await createTokenPair(store)

      // First rotation succeeds
      await rotateTokens(store, original.refreshToken)

      // Second rotation with same token should detect reuse
      await expect(rotateTokens(store, original.refreshToken)).rejects.toThrow(
        'refresh_token_reused',
      )

      expect(store.deleteAllSessions).toHaveBeenCalled()
      expect(store.deleteAllRefreshTokens).toHaveBeenCalled()
    })

    it('throws on expired refresh token', async () => {
      const pair = await createTokenPair(store)

      // Manually expire the refresh token
      const refreshHash = await hashToken(pair.refreshToken)
      const token = await store.getRefreshToken(refreshHash)
      if (token) {
        token.expiresAt = new Date(Date.now() - 1000).toISOString()
      }

      await expect(rotateTokens(store, pair.refreshToken)).rejects.toThrow('refresh_token_expired')
    })
  })
})
