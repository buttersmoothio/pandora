import type { AuthStore, RefreshToken, Session } from './auth-store'
import { generateSessionToken, hashToken } from './crypto'

/** Access token lifetime: 15 minutes */
const ACCESS_TTL_MS = 15 * 60 * 1000

/** Refresh token lifetime: 7 days */
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface TokenPair {
  /** Raw access token to send to the client */
  accessToken: string
  /** Access token expiration timestamp */
  accessExpiresAt: string
  /** Raw refresh token to send to the client */
  refreshToken: string
  /** Refresh token expiration timestamp */
  refreshExpiresAt: string
}

/**
 * Create a new token pair (access session + refresh token), store both, and return raw tokens.
 */
export async function createTokenPair(
  store: AuthStore,
  meta?: { userAgent?: string; ip?: string },
): Promise<TokenPair> {
  const now = new Date()

  // Create access session
  const access = await generateSessionToken()
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS)
  const session: Session = {
    tokenHash: access.tokenHash,
    expiresAt: accessExpiresAt.toISOString(),
    createdAt: now.toISOString(),
    userAgent: meta?.userAgent,
    ip: meta?.ip,
  }
  await store.createSession(session)

  // Create refresh token
  const refresh = await generateSessionToken()
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TTL_MS)
  const refreshToken: RefreshToken = {
    tokenHash: refresh.tokenHash,
    sessionHash: access.tokenHash,
    expiresAt: refreshExpiresAt.toISOString(),
    createdAt: now.toISOString(),
    userAgent: meta?.userAgent,
    ip: meta?.ip,
    used: false,
  }
  await store.createRefreshToken(refreshToken)

  return {
    accessToken: access.token,
    accessExpiresAt: session.expiresAt,
    refreshToken: refresh.token,
    refreshExpiresAt: refreshToken.expiresAt,
  }
}

/**
 * Verify a raw access token against the session store.
 * Returns the session if valid, null otherwise.
 */
export async function verifySessionToken(store: AuthStore, token: string): Promise<Session | null> {
  const tokenHash = await hashToken(token)
  return store.getSession(tokenHash)
}

/**
 * Rotate tokens: validate refresh token, detect reuse, create new pair.
 * Returns new token pair on success.
 * Throws on invalid/expired/reused refresh token.
 */
export async function rotateTokens(
  store: AuthStore,
  refreshTokenRaw: string,
  meta?: { userAgent?: string; ip?: string },
): Promise<TokenPair> {
  const refreshHash = await hashToken(refreshTokenRaw)
  const existing = await store.getRefreshToken(refreshHash)

  if (!existing) {
    throw new Error('invalid_refresh_token')
  }

  // Check expiration
  if (new Date(existing.expiresAt) <= new Date()) {
    await store.deleteRefreshToken(refreshHash)
    throw new Error('refresh_token_expired')
  }

  // Reuse detection: if this token was already used, someone may have stolen it.
  // Invalidate all sessions and refresh tokens as a safety measure.
  if (existing.used) {
    await store.deleteAllSessions()
    await store.deleteAllRefreshTokens()
    throw new Error('refresh_token_reused')
  }

  // Mark the old refresh token as used (don't delete yet — needed for reuse detection)
  await store.markRefreshTokenUsed(refreshHash)

  // Delete the old access session
  await store.deleteSession(existing.sessionHash)

  // Create new token pair
  return createTokenPair(store, meta)
}
