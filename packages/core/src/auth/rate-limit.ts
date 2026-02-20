import { createMiddleware } from 'hono/factory'

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimiterOptions {
  /** Maximum requests per window */
  max: number
  /** Window size in milliseconds */
  windowMs: number
}

/**
 * Create an in-memory rate limiter middleware for Hono.
 * Tracks requests per IP with periodic cleanup of expired entries.
 */
export function createRateLimiter({ max, windowMs }: RateLimiterOptions) {
  const store = new Map<string, RateLimitEntry>()
  let lastCleanup = Date.now()

  function cleanup(now: number) {
    // Run cleanup at most once per window
    if (now - lastCleanup < windowMs) return
    lastCleanup = now
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }

  return createMiddleware(async (c, next) => {
    const now = Date.now()
    cleanup(now)

    const ip = getClientIp(c)
    const entry = store.get(ip)

    if (entry && entry.resetAt > now) {
      entry.count++
      if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
        c.header('Retry-After', String(retryAfter))
        c.header('X-RateLimit-Limit', String(max))
        c.header('X-RateLimit-Remaining', '0')
        return c.json({ error: 'too_many_requests' }, 429)
      }
      c.header('X-RateLimit-Limit', String(max))
      c.header('X-RateLimit-Remaining', String(max - entry.count))
      return next()
    }

    store.set(ip, { count: 1, resetAt: now + windowMs })
    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(max - 1))
    return next()
  })
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header('X-Forwarded-For')
  if (forwarded) {
    // Take the first IP (client IP) from the chain
    return forwarded.split(',')[0].trim()
  }
  return c.req.header('X-Real-IP') ?? 'unknown'
}
