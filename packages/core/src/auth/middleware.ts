import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AuthStore } from './auth-store'
import { verifySessionToken } from './session'

/** Routes that don't require authentication */
const PUBLIC_PATHS = new Set(['/', '/api/auth/setup', '/api/auth/login'])

/** Extract bearer token from Authorization header or pandora_session cookie */
function extractToken(c: Context): string | undefined {
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

/**
 * Auth middleware for Hono.
 * - Skips public paths (/, /api/auth/setup, /api/auth/login)
 * - If no password is set (setup mode), blocks non-auth /api/* with 403
 * - Extracts token from Authorization header or pandora_session cookie
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

    const token = extractToken(c)
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
