import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AuthStore } from './auth-store'
import { extractBearerToken } from './routes'
import { verifySessionToken } from './session'

/** Routes that don't require authentication */
const PUBLIC_PATHS = new Set(['/', '/api/auth/setup', '/api/auth/login', '/api/auth/refresh'])

/**
 * Auth middleware for Hono.
 * - Skips public paths (/, /api/auth/setup, /api/auth/login, /api/auth/refresh)
 * - If no password is set (setup mode), blocks non-auth /api/* with 403
 * - Extracts token from Authorization: Bearer header
 * - Validates session, rejects with 401 if invalid/expired
 */
export function authMiddleware(getAuthStore: (c: Context) => Promise<AuthStore>) {
  return createMiddleware(async (c, next) => {
    const path = c.req.path

    if (PUBLIC_PATHS.has(path) || !path.startsWith('/api/')) {
      return next()
    }

    const store = await getAuthStore(c)
    const credential = await store.getCredential()

    if (!credential) {
      return c.json({ error: 'setup_required' }, 403)
    }

    const token = extractBearerToken(c)
    if (!token) {
      return c.json({ error: 'unauthorized' }, 401)
    }

    let session: Awaited<ReturnType<typeof verifySessionToken>>
    try {
      session = await verifySessionToken(store, token)
    } catch {
      return c.json({ error: 'unauthorized' }, 401)
    }
    if (!session) {
      return c.json({ error: 'unauthorized' }, 401)
    }

    c.set('session' as never, session as never)
    return next()
  })
}
