// SES lockdown — must run before any other code
import './ses-lockdown'

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './auth/middleware'
import { createRateLimiter } from './auth/rate-limit'
import { createAuthRoutes } from './auth/routes'
import { getLogger } from './logger'
import { loadAllPlugins } from './manifest'
import { chatRoutes } from './routes/chat'
import { configRoutes } from './routes/config'
import { discoveryRoutes } from './routes/discovery'
import { healthRoutes } from './routes/health'
import type { Env } from './routes/helpers'
import { createRuntimeMiddleware, getAuthStore } from './routes/helpers'
import { scheduleRoutes } from './routes/schedule'
import { threadRoutes } from './routes/threads'
import { webhookRoutes } from './routes/webhooks'

// Re-export for plugin authors
export { loadAllPlugins } from './manifest'

// Discover and register all manifest-based plugins
const registry = await loadAllPlugins()

// Create Hono app
const app = new Hono<Env>()

// Middleware
app.use('*', logger())
app.use('*', createRuntimeMiddleware(registry))
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const envVars = c.var.envVars
      const corsOrigins = envVars.CORS_ORIGINS

      if (corsOrigins === '*') return origin

      const allowed = new Set<string>()

      // FRONTEND_URL is always allowed if set
      if (envVars.FRONTEND_URL) allowed.add(envVars.FRONTEND_URL)

      if (corsOrigins) {
        // Explicit origins override the default
        for (const o of corsOrigins.split(',')) {
          const trimmed = o.trim()
          if (trimmed) allowed.add(trimmed)
        }
      } else if (!envVars.FRONTEND_URL) {
        // Default: allow the bundled UI
        allowed.add('http://localhost:3000')
      }

      return allowed.has(origin) ? origin : ''
    },
    exposeHeaders: ['X-Thread-Id'],
  }),
)

// Health check
app.route('/', healthRoutes)

// Channel webhook routes — BEFORE auth middleware so platforms can POST freely
app.route('/wh', webhookRoutes)

// Rate limiting on auth endpoints
app.use('/api/auth/login', createRateLimiter({ max: 5, windowMs: 60_000 }))
app.use('/api/auth/setup', createRateLimiter({ max: 3, windowMs: 60_000 }))
app.use('/api/auth/refresh', createRateLimiter({ max: 10, windowMs: 60_000 }))
app.use('/api/auth/change-password', createRateLimiter({ max: 3, windowMs: 60_000 }))

// Auth middleware — protects all /api/* routes
app.use('/api/*', authMiddleware(getAuthStore))

// Auth routes
app.route('/api/auth', createAuthRoutes(getAuthStore))

// Sub-router mounting
app.route('/api/config', configRoutes)
app.route('/api', discoveryRoutes)
app.route('/api/chat', chatRoutes)
app.route('/api/threads', threadRoutes)
app.route('/api/schedule', scheduleRoutes)

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404)
})

// Error handler
app.onError((err, c) => {
  const log = getLogger()
  log.error('Unhandled error', { error: err.message, path: c.req.path })
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500,
  )
})

export default app
export { app }
