import type { AuthStore, PasswordCredential, Session } from '../auth-store'

const CREDENTIAL_KEY = 'pandora:auth:credential'
const SESSION_PREFIX = 'pandora:auth:session:'
const SESSION_INDEX_KEY = 'pandora:auth:sessions'

/**
 * Redis/KV-based auth store for Upstash.
 * Zero driver-specific imports - callers provide a generic redis-like object.
 */
export class RedisAuthStore implements AuthStore {
  constructor(
    private redis: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown, opts?: { ex?: number }) => Promise<unknown>
      del: (...keys: string[]) => Promise<unknown>
      smembers: (key: string) => Promise<string[]>
      sadd: (key: string, ...members: string[]) => Promise<unknown>
      srem: (key: string, ...members: string[]) => Promise<unknown>
    },
  ) {}

  async init(): Promise<void> {
    // No-op for KV stores — no schema to create
  }

  async getCredential(): Promise<PasswordCredential | null> {
    const value = await this.redis.get(CREDENTIAL_KEY)
    if (!value) return null
    return (typeof value === 'string' ? JSON.parse(value) : value) as PasswordCredential
  }

  async setCredential(credential: PasswordCredential): Promise<void> {
    await this.redis.set(CREDENTIAL_KEY, JSON.stringify(credential))
  }

  async createSession(session: Session): Promise<void> {
    const ttl = Math.max(1, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
    await this.redis.set(SESSION_PREFIX + session.tokenHash, JSON.stringify(session), { ex: ttl })
    await this.redis.sadd(SESSION_INDEX_KEY, session.tokenHash)
  }

  async getSession(tokenHash: string): Promise<Session | null> {
    const value = await this.redis.get(SESSION_PREFIX + tokenHash)
    if (!value) {
      // Clean up index if session expired (TTL removed it)
      await this.redis.srem(SESSION_INDEX_KEY, tokenHash)
      return null
    }
    const session = (typeof value === 'string' ? JSON.parse(value) : value) as Session

    // Double-check expiration
    if (new Date(session.expiresAt) <= new Date()) {
      await this.deleteSession(tokenHash)
      return null
    }

    return session
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.redis.del(SESSION_PREFIX + tokenHash)
    await this.redis.srem(SESSION_INDEX_KEY, tokenHash)
  }

  async deleteAllSessions(): Promise<void> {
    const hashes = await this.redis.smembers(SESSION_INDEX_KEY)
    if (hashes.length > 0) {
      const keys = hashes.map((h) => SESSION_PREFIX + h)
      await this.redis.del(...keys)
    }
    await this.redis.del(SESSION_INDEX_KEY)
  }

  async listSessions(): Promise<Session[]> {
    const hashes = await this.redis.smembers(SESSION_INDEX_KEY)
    const sessions: Session[] = []

    for (const hash of hashes) {
      const session = await this.getSession(hash)
      if (session) sessions.push(session)
    }

    return sessions
  }
}
