import type { Context } from 'hono'
import { Hono } from 'hono'
import type { AuthStore } from './auth-store'
import { hashPassword, hashToken, verifyPassword } from './crypto'
import { createSession } from './session'

const MIN_PASSWORD_LENGTH = 8

/**
 * Create auth routes sub-app.
 * Mounted at /api/auth in the main app.
 */
export function createAuthRoutes(getAuthStore: (c: Context) => Promise<AuthStore>) {
  const auth = new Hono()

  // POST /api/auth/setup — set initial password, auto-login
  auth.post('/setup', async (c) => {
    const store = await getAuthStore(c)
    const existing = await store.getCredential()

    if (existing) {
      return c.json({ error: 'already_setup' }, 409)
    }

    const body = await c.req.json<{ password?: string }>()
    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
    }

    const { hash, salt, iterations } = await hashPassword(body.password)
    await store.setCredential({
      hash,
      salt,
      iterations,
      createdAt: new Date().toISOString(),
    })

    // Auto-login: create session and return token
    const userAgent = c.req.header('User-Agent')
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
    const session = await createSession(store, { userAgent, ip: ip ?? undefined })

    setCookie(c, session.token, session.expiresAt)

    return c.json({ token: session.token, expiresAt: session.expiresAt }, 201)
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
      return c.json({ error: 'invalid_credentials' }, 401)
    }

    const userAgent = c.req.header('User-Agent')
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
    const session = await createSession(store, { userAgent, ip: ip ?? undefined })

    setCookie(c, session.token, session.expiresAt)

    return c.json({ token: session.token, expiresAt: session.expiresAt })
  })

  // POST /api/auth/logout — delete current session
  auth.post('/logout', async (c) => {
    const store = await getAuthStore(c)
    const token = extractToken(c)

    if (token) {
      const tokenHash = await hashToken(token)
      await store.deleteSession(tokenHash)
    }

    clearCookie(c)

    return c.json({ success: true })
  })

  // POST /api/auth/change-password — change password, invalidate all sessions
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

    // Invalidate all sessions
    await store.deleteAllSessions()

    // Create new session for current user
    const userAgent = c.req.header('User-Agent')
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP')
    const session = await createSession(store, { userAgent, ip: ip ?? undefined })

    setCookie(c, session.token, session.expiresAt)

    return c.json({ token: session.token, expiresAt: session.expiresAt })
  })

  // GET /api/auth/sessions — list active sessions
  auth.get('/sessions', async (c) => {
    const store = await getAuthStore(c)
    const sessions = await store.listSessions()

    const token = extractToken(c)
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

    const token = extractToken(c)
    const currentHash = token ? await hashToken(token) : null
    const isCurrent = targetHash === currentHash

    await store.deleteSession(targetHash)

    if (isCurrent) {
      clearCookie(c)
    }

    return c.json({ success: true, loggedOut: isCurrent })
  })

  // DELETE /api/auth/sessions — revoke all sessions
  auth.delete('/sessions', async (c) => {
    const store = await getAuthStore(c)
    await store.deleteAllSessions()
    clearCookie(c)
    return c.json({ success: true })
  })

  return auth
}

// --- Helpers ---

function extractToken(c: {
  req: { header: (name: string) => string | undefined }
}): string | undefined {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  const cookie = c.req.header('Cookie')
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)pandora_session=([^\s;]+)/)
    if (match) return match[1]
  }
  return undefined
}

function setCookie(
  c: { header: (name: string, value: string) => void },
  token: string,
  expiresAt: string,
): void {
  const expires = new Date(expiresAt).toUTCString()
  c.header(
    'Set-Cookie',
    `pandora_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`,
  )
}

function clearCookie(c: { header: (name: string, value: string) => void }): void {
  c.header('Set-Cookie', 'pandora_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
}
