import type { Context } from 'hono'
import { Hono } from 'hono'
import { getLogger } from '../logger'
import type { Env } from '../routes/helpers'
import type { AuthStore } from './auth-store'
import { hashPassword, hashToken, verifyPassword } from './crypto'
import { createTokenPair, rotateTokens } from './session'

const MIN_PASSWORD_LENGTH = 8

/** Extract bearer token from Authorization header */
export function extractBearerToken(c: {
  req: { header: (name: string) => string | undefined }
}): string | undefined {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return undefined
}

/**
 * Create auth routes sub-app.
 * Mounted at /api/auth in the main app.
 */
export function createAuthRoutes(getAuthStore: (c: Context<Env>) => Promise<AuthStore>) {
  const auth = new Hono<Env>()
  const log = getLogger()

  // POST /api/auth/setup — set initial password, auto-login
  auth.post('/setup', async (c) => {
    const store = await getAuthStore(c)

    const body = await c.req.json<{ password?: string }>()
    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
    }

    const { hash, salt, iterations } = await hashPassword(body.password)
    const created = await store.setCredentialIfNotExists({
      hash,
      salt,
      iterations,
      createdAt: new Date().toISOString(),
    })

    if (!created) {
      log.warn('Setup attempted but already configured')
      return c.json({ error: 'already_setup' }, 409)
    }

    // Auto-login: create token pair and return
    const userAgent = c.req.header('User-Agent')
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
    const pair = await createTokenPair(store, { userAgent, ip: ip ?? undefined })

    log.info('Initial setup complete')
    return c.json(
      {
        token: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresAt: pair.accessExpiresAt,
        refreshExpiresAt: pair.refreshExpiresAt,
      },
      201,
    )
  })

  // POST /api/auth/login — password login
  auth.post('/login', async (c) => {
    const store = await getAuthStore(c)
    const credential = await store.getCredential()

    if (!credential) {
      return c.json({ error: 'setup_required' }, 403)
    }

    const body = await c.req.json<{ password?: string }>()
    if (!body.password) {
      return c.json({ error: 'Password is required' }, 400)
    }

    const valid = await verifyPassword(body.password, credential)
    if (!valid) {
      log.warn('Login failed: invalid credentials')
      return c.json({ error: 'invalid_credentials' }, 401)
    }

    const userAgent = c.req.header('User-Agent')
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
    const pair = await createTokenPair(store, { userAgent, ip: ip ?? undefined })

    log.info('Login successful')
    return c.json({
      token: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresAt: pair.accessExpiresAt,
      refreshExpiresAt: pair.refreshExpiresAt,
    })
  })

  // POST /api/auth/logout — delete current session
  auth.post('/logout', async (c) => {
    const store = await getAuthStore(c)
    const token = extractBearerToken(c)

    if (token) {
      const tokenHash = await hashToken(token)
      await store.deleteSession(tokenHash)
    }

    log.info('Logout successful')
    return c.json({ success: true })
  })

  // POST /api/auth/change-password — change password, invalidate all sessions + refresh tokens
  auth.post('/change-password', async (c) => {
    const store = await getAuthStore(c)
    const credential = await store.getCredential()

    if (!credential) {
      return c.json({ error: 'setup_required' }, 403)
    }

    const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>()
    if (!(body.currentPassword && body.newPassword)) {
      return c.json({ error: 'Both currentPassword and newPassword are required' }, 400)
    }

    if (body.newPassword.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
    }

    const valid = await verifyPassword(body.currentPassword, credential)
    if (!valid) {
      return c.json({ error: 'invalid_credentials' }, 401)
    }

    const { hash, salt, iterations } = await hashPassword(body.newPassword)
    await store.setCredential({
      hash,
      salt,
      iterations,
      createdAt: new Date().toISOString(),
    })

    // Invalidate all sessions and refresh tokens
    await store.deleteAllSessions()
    await store.deleteAllRefreshTokens()

    // Create new token pair for current user
    const userAgent = c.req.header('User-Agent')
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
    const pair = await createTokenPair(store, { userAgent, ip: ip ?? undefined })

    log.info('Password changed, all sessions invalidated')
    return c.json({
      token: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresAt: pair.accessExpiresAt,
      refreshExpiresAt: pair.refreshExpiresAt,
    })
  })

  // GET /api/auth/sessions — list active sessions
  auth.get('/sessions', async (c) => {
    const store = await getAuthStore(c)
    const sessions = await store.listSessions()

    const token = extractBearerToken(c)
    const currentHash = token ? await hashToken(token) : null

    return c.json({
      sessions: sessions.map((s) => ({
        id: s.tokenHash,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        userAgent: s.userAgent,
        ip: s.ip,
        current: s.tokenHash === currentHash,
      })),
    })
  })

  // DELETE /api/auth/sessions/:id — revoke a specific session
  auth.delete('/sessions/:id', async (c) => {
    const store = await getAuthStore(c)
    const targetHash = c.req.param('id')

    const session = await store.getSession(targetHash)
    if (!session) {
      return c.json({ error: 'session_not_found' }, 404)
    }

    const token = extractBearerToken(c)
    const currentHash = token ? await hashToken(token) : null
    const isCurrent = targetHash === currentHash

    await store.deleteSession(targetHash)

    return c.json({ success: true, loggedOut: isCurrent })
  })

  // DELETE /api/auth/sessions — revoke all sessions and refresh tokens
  auth.delete('/sessions', async (c) => {
    const store = await getAuthStore(c)
    await store.deleteAllSessions()
    await store.deleteAllRefreshTokens()
    return c.json({ success: true })
  })

  // POST /api/auth/refresh — rotate tokens using refresh token from body
  auth.post('/refresh', async (c) => {
    const store = await getAuthStore(c)

    let refreshTokenRaw: string | undefined
    try {
      const body = await c.req.json<{ refreshToken?: string }>()
      refreshTokenRaw = body.refreshToken
    } catch {
      // invalid JSON
    }

    if (!refreshTokenRaw) {
      return c.json({ error: 'refresh_token_required' }, 400)
    }

    try {
      const userAgent = c.req.header('User-Agent')
      const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
      const pair = await rotateTokens(store, refreshTokenRaw, {
        userAgent,
        ip: ip ?? undefined,
      })

      return c.json({
        token: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresAt: pair.accessExpiresAt,
        refreshExpiresAt: pair.refreshExpiresAt,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid_refresh_token'
      log.warn('Token refresh failed', { error: message })
      return c.json({ error: message }, 401)
    }
  })

  return auth
}
