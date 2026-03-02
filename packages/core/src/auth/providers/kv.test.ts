import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PasswordCredential, RefreshToken, Session } from '../auth-store'
import { RedisAuthStore } from './kv'

const testCredential: PasswordCredential = {
  hash: 'testhash==',
  salt: 'testsalt==',
  iterations: 600000,
  createdAt: '2024-01-01T00:00:00.000Z',
}

const futureDate = new Date(Date.now() + 86400000).toISOString()

const testSession: Session = {
  tokenHash: 'abc123def456',
  expiresAt: futureDate,
  createdAt: '2024-01-01T00:00:00.000Z',
  userAgent: 'test-agent',
  ip: '127.0.0.1',
}

const testRefreshToken: RefreshToken = {
  tokenHash: 'refresh_hash_123',
  sessionHash: 'session_hash_456',
  expiresAt: futureDate,
  createdAt: '2024-01-01T00:00:00.000Z',
  userAgent: 'test-agent',
  ip: '127.0.0.1',
  used: false,
}

describe('RedisAuthStore', () => {
  let store: RedisAuthStore
  let redis: {
    get: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    del: ReturnType<typeof vi.fn>
    smembers: ReturnType<typeof vi.fn>
    sadd: ReturnType<typeof vi.fn>
    srem: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    redis = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      smembers: vi.fn(async () => []),
      sadd: vi.fn(async () => 1),
      srem: vi.fn(async () => 1),
    }
    store = new RedisAuthStore(redis)
  })

  describe('init', () => {
    it('is a no-op', async () => {
      await store.init()
      // No redis calls expected
      expect(redis.get).not.toHaveBeenCalled()
    })
  })

  describe('getCredential', () => {
    it('returns null when key does not exist', async () => {
      const result = await store.getCredential()
      expect(result).toBeNull()
      expect(redis.get).toHaveBeenCalledWith('pandora:auth:credential')
    })

    it('parses JSON string value', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(testCredential))
      const result = await store.getCredential()
      expect(result).toEqual(testCredential)
    })

    it('returns object directly (auto-deserialized)', async () => {
      redis.get.mockResolvedValueOnce(testCredential)
      const result = await store.getCredential()
      expect(result).toEqual(testCredential)
    })
  })

  describe('setCredential', () => {
    it('stores stringified credential', async () => {
      await store.setCredential(testCredential)
      expect(redis.set).toHaveBeenCalledWith(
        'pandora:auth:credential',
        JSON.stringify(testCredential),
      )
    })
  })

  describe('createSession', () => {
    it('stores session with TTL and adds to index', async () => {
      await store.createSession(testSession)
      expect(redis.set).toHaveBeenCalledWith(
        `pandora:auth:session:${testSession.tokenHash}`,
        JSON.stringify(testSession),
        expect.objectContaining({ ex: expect.any(Number) }),
      )
      expect(redis.sadd).toHaveBeenCalledWith('pandora:auth:sessions', testSession.tokenHash)
    })
  })

  describe('getSession', () => {
    it('returns null when session does not exist', async () => {
      const result = await store.getSession('nonexistent')
      expect(result).toBeNull()
    })

    it('returns session when found', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(testSession))
      const result = await store.getSession(testSession.tokenHash)
      expect(result).toEqual(testSession)
    })
  })

  describe('deleteSession', () => {
    it('deletes session key and removes from index', async () => {
      await store.deleteSession('abc123')
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:session:abc123')
      expect(redis.srem).toHaveBeenCalledWith('pandora:auth:sessions', 'abc123')
    })
  })

  describe('deleteAllSessions', () => {
    it('deletes all session keys and index', async () => {
      redis.smembers.mockResolvedValueOnce(['hash1', 'hash2'])
      await store.deleteAllSessions()
      expect(redis.del).toHaveBeenCalledWith(
        'pandora:auth:session:hash1',
        'pandora:auth:session:hash2',
      )
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:sessions')
    })

    it('handles empty session list', async () => {
      redis.smembers.mockResolvedValueOnce([])
      await store.deleteAllSessions()
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:sessions')
    })
  })

  describe('listSessions', () => {
    it('returns empty array when no sessions', async () => {
      const result = await store.listSessions()
      expect(result).toEqual([])
    })
  })

  describe('createRefreshToken', () => {
    it('stores refresh token with TTL and adds to index', async () => {
      await store.createRefreshToken(testRefreshToken)
      expect(redis.set).toHaveBeenCalledWith(
        `pandora:auth:refresh:${testRefreshToken.tokenHash}`,
        JSON.stringify(testRefreshToken),
        expect.objectContaining({ ex: expect.any(Number) }),
      )
      expect(redis.sadd).toHaveBeenCalledWith('pandora:auth:refreshes', testRefreshToken.tokenHash)
    })
  })

  describe('getRefreshToken', () => {
    it('returns null when token does not exist', async () => {
      const result = await store.getRefreshToken('nonexistent')
      expect(result).toBeNull()
    })

    it('returns refresh token when found', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(testRefreshToken))
      const result = await store.getRefreshToken(testRefreshToken.tokenHash)
      expect(result).toEqual(testRefreshToken)
    })

    it('cleans up index when key is missing (TTL expired)', async () => {
      await store.getRefreshToken('expired_hash')
      expect(redis.srem).toHaveBeenCalledWith('pandora:auth:refreshes', 'expired_hash')
    })
  })

  describe('deleteRefreshToken', () => {
    it('deletes refresh token key and removes from index', async () => {
      await store.deleteRefreshToken('refresh123')
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:refresh:refresh123')
      expect(redis.srem).toHaveBeenCalledWith('pandora:auth:refreshes', 'refresh123')
    })
  })

  describe('deleteAllRefreshTokens', () => {
    it('deletes all refresh token keys and index', async () => {
      redis.smembers.mockResolvedValueOnce(['rh1', 'rh2'])
      await store.deleteAllRefreshTokens()
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:refresh:rh1', 'pandora:auth:refresh:rh2')
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:refreshes')
    })

    it('handles empty refresh token list', async () => {
      redis.smembers.mockResolvedValueOnce([])
      await store.deleteAllRefreshTokens()
      expect(redis.del).toHaveBeenCalledWith('pandora:auth:refreshes')
    })
  })

  describe('markRefreshTokenUsed', () => {
    it('updates used flag and preserves TTL', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify(testRefreshToken))
      await store.markRefreshTokenUsed(testRefreshToken.tokenHash)

      const expected = { ...testRefreshToken, used: true }
      expect(redis.set).toHaveBeenCalledWith(
        `pandora:auth:refresh:${testRefreshToken.tokenHash}`,
        JSON.stringify(expected),
        expect.objectContaining({ ex: expect.any(Number) }),
      )
    })

    it('does nothing when token does not exist', async () => {
      await store.markRefreshTokenUsed('nonexistent')
      expect(redis.set).not.toHaveBeenCalled()
    })
  })
})
