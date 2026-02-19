import type { AuthStore, Session } from './auth-store'
import { generateSessionToken, hashToken } from './crypto'

/** Session lifetime: 30 days */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionInfo {
  /** Raw token to send to the client */
  token: string
  /** Expiration timestamp */
  expiresAt: string
}

/**
 * Create a new session, store it, and return the raw token for the client.
 */
export async function createSession(
  store: AuthStore,
  meta?: { userAgent?: string; ip?: string },
): Promise<SessionInfo> {
  const { token, tokenHash } = await generateSessionToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  const session: Session = {
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    userAgent: meta?.userAgent,
    ip: meta?.ip,
  }

  await store.createSession(session)

  return { token, expiresAt: session.expiresAt }
}

/**
 * Verify a raw token against the session store.
 * Returns the session if valid, null otherwise.
 */
export async function verifySessionToken(store: AuthStore, token: string): Promise<Session | null> {
  const tokenHash = await hashToken(token)
  return store.getSession(tokenHash)
}
