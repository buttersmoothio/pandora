import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PasswordCredential, RefreshToken, Session } from '../auth-store'
import { SQLAuthStore } from './sql'

const testCredential: PasswordCredential = {
  hash: 'testhash==',
  salt: 'testsalt==',
  iterations: 600000,
  createdAt: '2024-01-01T00:00:00.000Z',
}

const futureDate = new Date(Date.now() + 86400000).toISOString()
const pastDate = new Date(Date.now() - 86400000).toISOString()

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

describe('SQLAuthStore', () => {
  describe.each(['sqlite', 'postgres', 'mssql'] as const)('%s dialect', (dialect) => {
    let store: SQLAuthStore
    let execute: ReturnType<typeof vi.fn>
    let calls: { sql: string; params?: unknown[] }[]

    beforeEach(() => {
      calls = []
      execute = vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return []
      })
      store = new SQLAuthStore(execute, dialect)
    })

    describe('init', () => {
      it('creates all three tables', async () => {
        await store.init()
        expect(execute).toHaveBeenCalledTimes(3)

        const credSql = calls[0].sql
        const sessSql = calls[1].sql
        const refreshSql = calls[2].sql

        expect(credSql).toContain('pandora_auth_credentials')
        expect(sessSql).toContain('pandora_auth_sessions')
        expect(refreshSql).toContain('pandora_auth_refresh_tokens')

        if (dialect === 'postgres') {
          expect(credSql).toContain('TIMESTAMPTZ')
          expect(sessSql).toContain('TIMESTAMPTZ')
          expect(refreshSql).toContain('TIMESTAMPTZ')
          expect(refreshSql).toContain('BOOLEAN')
        } else if (dialect === 'mssql') {
          expect(credSql).toContain('NVARCHAR')
          expect(credSql).toContain('sysobjects')
          expect(sessSql).toContain('DATETIME2')
          expect(refreshSql).toContain('DATETIME2')
          expect(refreshSql).toContain('BIT')
        } else {
          expect(credSql).toContain('CREATE TABLE IF NOT EXISTS')
          expect(sessSql).toContain("datetime('now')")
          expect(refreshSql).toContain('pandora_auth_refresh_tokens')
          expect(refreshSql).toContain('session_hash')
        }
      })
    })

    describe('getCredential', () => {
      it('returns null when no rows', async () => {
        const result = await store.getCredential()
        expect(result).toBeNull()
      })

      it('returns null on error', async () => {
        execute.mockRejectedValueOnce(new Error('no such table'))
        const result = await store.getCredential()
        expect(result).toBeNull()
      })

      it('returns credential from row', async () => {
        execute.mockResolvedValueOnce([
          {
            hash: testCredential.hash,
            salt: testCredential.salt,
            iterations: testCredential.iterations,
            created_at: testCredential.createdAt,
          },
        ])
        const result = await store.getCredential()
        expect(result).toEqual(testCredential)
      })

      it('uses correct parameter placeholder', async () => {
        await store.getCredential()
        const sql = calls[0].sql

        if (dialect === 'postgres') expect(sql).toContain('$1')
        else if (dialect === 'mssql') expect(sql).toContain('@p1')
        else expect(sql).toContain('?')
      })
    })

    describe('setCredential', () => {
      it('upserts credential', async () => {
        await store.setCredential(testCredential)
        expect(execute).toHaveBeenCalledOnce()

        const { sql, params } = calls[0]
        expect(sql).toContain('pandora_auth_credentials')
        expect(params).toContain(testCredential.hash)
        expect(params).toContain(testCredential.salt)

        if (dialect === 'postgres') expect(sql).toContain('ON CONFLICT')
        else if (dialect === 'mssql') expect(sql).toContain('MERGE')
        else expect(sql).toContain('ON CONFLICT')
      })
    })

    describe('createSession', () => {
      it('inserts session', async () => {
        await store.createSession(testSession)
        expect(execute).toHaveBeenCalledOnce()

        const { sql, params } = calls[0]
        expect(sql).toContain('pandora_auth_sessions')
        expect(params).toContain(testSession.tokenHash)
        expect(params).toContain(testSession.expiresAt)
      })
    })

    describe('getSession', () => {
      it('returns null when no rows', async () => {
        const result = await store.getSession('nonexistent')
        expect(result).toBeNull()
      })

      it('returns session from valid row', async () => {
        execute.mockResolvedValueOnce([
          {
            token_hash: testSession.tokenHash,
            expires_at: testSession.expiresAt,
            created_at: testSession.createdAt,
            user_agent: testSession.userAgent,
            ip: testSession.ip,
          },
        ])
        const result = await store.getSession(testSession.tokenHash)
        expect(result).toEqual(testSession)
      })

      it('returns null and deletes expired session', async () => {
        execute.mockResolvedValueOnce([
          {
            token_hash: 'expired',
            expires_at: pastDate,
            created_at: '2024-01-01T00:00:00.000Z',
            user_agent: null,
            ip: null,
          },
        ])
        const result = await store.getSession('expired')
        expect(result).toBeNull()
        // Second call is the DELETE for cleanup
        expect(execute).toHaveBeenCalledTimes(2)
      })
    })

    describe('deleteSession', () => {
      it('deletes by token hash', async () => {
        await store.deleteSession('abc123')
        expect(execute).toHaveBeenCalledOnce()
        expect(calls[0].sql).toContain('DELETE')
        expect(calls[0].params).toContain('abc123')
      })
    })

    describe('deleteAllSessions', () => {
      it('deletes all sessions', async () => {
        await store.deleteAllSessions()
        expect(execute).toHaveBeenCalledOnce()
        expect(calls[0].sql).toContain('DELETE')
        expect(calls[0].sql).toContain('pandora_auth_sessions')
      })
    })

    describe('listSessions', () => {
      it('returns empty array when no sessions', async () => {
        const result = await store.listSessions()
        expect(result).toEqual([])
      })

      it('returns empty array on error', async () => {
        execute.mockRejectedValueOnce(new Error('no such table'))
        const result = await store.listSessions()
        expect(result).toEqual([])
      })
    })

    describe('createRefreshToken', () => {
      it('inserts refresh token', async () => {
        await store.createRefreshToken(testRefreshToken)
        expect(execute).toHaveBeenCalledOnce()

        const { sql, params } = calls[0]
        expect(sql).toContain('pandora_auth_refresh_tokens')
        expect(params).toContain(testRefreshToken.tokenHash)
        expect(params).toContain(testRefreshToken.sessionHash)
        expect(params).toContain(testRefreshToken.expiresAt)
      })
    })

    describe('getRefreshToken', () => {
      it('returns null when no rows', async () => {
        const result = await store.getRefreshToken('nonexistent')
        expect(result).toBeNull()
      })

      it('returns null on error', async () => {
        execute.mockRejectedValueOnce(new Error('no such table'))
        const result = await store.getRefreshToken('nonexistent')
        expect(result).toBeNull()
      })

      it('returns refresh token from valid row', async () => {
        execute.mockResolvedValueOnce([
          {
            token_hash: testRefreshToken.tokenHash,
            session_hash: testRefreshToken.sessionHash,
            expires_at: testRefreshToken.expiresAt,
            created_at: testRefreshToken.createdAt,
            user_agent: testRefreshToken.userAgent,
            ip: testRefreshToken.ip,
            used: 0,
          },
        ])
        const result = await store.getRefreshToken(testRefreshToken.tokenHash)
        expect(result).toEqual(testRefreshToken)
      })

      it('maps used=1 to true', async () => {
        execute.mockResolvedValueOnce([
          {
            token_hash: testRefreshToken.tokenHash,
            session_hash: testRefreshToken.sessionHash,
            expires_at: testRefreshToken.expiresAt,
            created_at: testRefreshToken.createdAt,
            user_agent: null,
            ip: null,
            used: 1,
          },
        ])
        const result = await store.getRefreshToken(testRefreshToken.tokenHash)
        expect(result?.used).toBe(true)
      })
    })

    describe('deleteRefreshToken', () => {
      it('deletes by token hash', async () => {
        await store.deleteRefreshToken('refresh123')
        expect(execute).toHaveBeenCalledOnce()
        expect(calls[0].sql).toContain('DELETE')
        expect(calls[0].sql).toContain('pandora_auth_refresh_tokens')
        expect(calls[0].params).toContain('refresh123')
      })
    })

    describe('deleteAllRefreshTokens', () => {
      it('deletes all refresh tokens', async () => {
        await store.deleteAllRefreshTokens()
        expect(execute).toHaveBeenCalledOnce()
        expect(calls[0].sql).toContain('DELETE')
        expect(calls[0].sql).toContain('pandora_auth_refresh_tokens')
      })
    })

    describe('markRefreshTokenUsed', () => {
      it('updates used flag', async () => {
        await store.markRefreshTokenUsed('refresh123')
        expect(execute).toHaveBeenCalledOnce()
        expect(calls[0].sql).toContain('UPDATE')
        expect(calls[0].sql).toContain('pandora_auth_refresh_tokens')
        expect(calls[0].params).toContain('refresh123')
      })
    })
  })
})
