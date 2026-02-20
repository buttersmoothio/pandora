import 'ses'

// SES lockdown - must run before any other code
// Check if already locked down (e.g., in test environment)
if (!Object.isFrozen(Object.prototype)) {
  lockdown({
    errorTaming: 'unsafe', // Preserve stack traces
    overrideTaming: 'severe', // Maximum compatibility with npm packages
    consoleTaming: 'unsafe', // Keep console for debugging
    stackFiltering: 'verbose',
  })
}

import { handleChatStream } from '@mastra/ai-sdk'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { createUIMessageStreamResponse } from 'ai'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import pkg from '../package.json'
import { authMiddleware } from './auth/middleware'
import { createRateLimiter } from './auth/rate-limit'
import { createAuthRoutes, extractBearerToken } from './auth/routes'
import { clearConfigCache, getConfig, resetConfig, updateConfig } from './config'
import { getRuntimeKey, isServerless } from './env'
import { getLogger } from './logger'
import { clearMastraCache, getMastra } from './mastra'
import { getStorage } from './storage'

// Bindings type for Cloudflare Workers
type Bindings = {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

// Create Hono app
const app = new Hono<{ Bindings: Bindings }>()

// Middleware
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const envVars = extractStringEnv(env(c))
      const corsOrigins = envVars.CORS_ORIGINS

      // Explicit wildcard opt-in for BYO-UI
      if (corsOrigins === '*') return origin

      const allowed = new Set<string>()
      const frontendUrl = envVars.FRONTEND_URL ?? 'http://localhost:3000'
      allowed.add(frontendUrl)

      if (corsOrigins) {
        for (const o of corsOrigins.split(',')) {
          const trimmed = o.trim()
          if (trimmed) allowed.add(trimmed)
        }
      }

      return allowed.has(origin) ? origin : ''
    },
  }),
)

// Health check - returns runtime info + auth state
app.get('/', async (c) => {
  let authState = { setup: false, authenticated: false }
  try {
    const envVars = extractStringEnv(env(c))
    const { auth: authStore } = await getStorage(envVars, c.env)
    const credential = await authStore.getCredential()
    const isSetup = !!credential

    let authenticated = false
    if (isSetup) {
      const token = extractBearerToken(c)
      if (token) {
        const { verifySessionToken } = await import('./auth/session')
        const session = await verifySessionToken(authStore, token)
        authenticated = !!session
      }
    }

    authState = { setup: isSetup, authenticated }
  } catch {
    // If storage fails, return default auth state
  }

  return c.json({
    name: 'Pandora',
    version: pkg.version,
    runtime: getRuntimeKey(),
    serverless: isServerless(),
    auth: authState,
  })
})

/**
 * Helper to extract string env vars from raw env object
 */
function extractStringEnv(raw: Record<string, unknown>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

/** Helper to get auth store from request context */
async function getAuthStore(c: unknown) {
  const envVars = extractStringEnv(env(c as never))
  const bindings = (c as { env: Bindings }).env
  const { auth } = await getStorage(envVars, bindings)
  return auth
}

// Rate limiting on auth endpoints
app.use('/api/auth/login', createRateLimiter({ max: 5, windowMs: 60_000 }))
app.use('/api/auth/setup', createRateLimiter({ max: 3, windowMs: 60_000 }))
app.use('/api/auth/refresh', createRateLimiter({ max: 10, windowMs: 60_000 }))
app.use('/api/auth/change-password', createRateLimiter({ max: 3, windowMs: 60_000 }))

// Auth middleware — protects all /api/* routes
app.use('/api/*', authMiddleware(getAuthStore))

// Auth routes
app.route('/api/auth', createAuthRoutes(getAuthStore))

// Storage info endpoint
app.get('/api/storage', async (c) => {
  const envVars = extractStringEnv(env(c))
  const provider = envVars.STORAGE_PROVIDER ?? 'libsql'

  return c.json({
    provider,
    serverless: isServerless(),
  })
})

// Initialize storage endpoint (useful for testing)
app.post('/api/storage/init', async (c) => {
  const log = getLogger()
  try {
    const envVars = extractStringEnv(env(c))
    const { mastra } = await getStorage(envVars, c.env)
    log.info('Storage initialized', {
      provider: envVars.STORAGE_PROVIDER ?? 'libsql',
      id: mastra.id,
    })
    return c.json({
      success: true,
      provider: envVars.STORAGE_PROVIDER ?? 'libsql',
      id: mastra.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Storage init failed', { error: message })
    return c.json({ success: false, error: message }, 500)
  }
})

// Config endpoint - get current config
app.get('/api/config', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await getConfig(configStore, envVars)
  return c.json(config)
})

// Config endpoint - update config
app.patch('/api/config', async (c) => {
  const log = getLogger()
  try {
    const envVars = extractStringEnv(env(c))
    const { config: configStore } = await getStorage(envVars, c.env)
    const patch = await c.req.json()
    const updated = await updateConfig(configStore, patch)
    // Invalidate Mastra cache so next request rebuilds with new config
    clearConfigCache()
    clearMastraCache()
    log.info('Config updated', { keys: Object.keys(patch) })
    return c.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error('Config validation failed', { issues: messages })
      return c.json({ error: messages.join(', ') }, 400)
    }
    const message = err instanceof Error ? err.message : 'Invalid config'
    log.error('Config update failed', { error: message })
    return c.json({ error: message }, 400)
  }
})

// Config endpoint - reset to defaults
app.delete('/api/config', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await resetConfig(configStore)
  return c.json(config)
})

// Models endpoint - returns available providers and models
app.get('/api/models', (c) => {
  const envVars = extractStringEnv(env(c))
  const providers = Object.entries(PROVIDER_REGISTRY).map(([id, config]) => {
    const keys = Array.isArray(config.apiKeyEnvVar) ? config.apiKeyEnvVar : [config.apiKeyEnvVar]
    const configured = keys.some((key) => !!envVars[key])
    return {
      id,
      name: config.name,
      models: config.models,
      configured,
      docUrl: config.docUrl,
      gateway: config.gateway,
      envVars: keys,
    }
  })
  return c.json({ providers })
})

// Chat endpoint - AI SDK compatible streaming
app.post('/api/chat', async (c) => {
  const log = getLogger()
  try {
    const params = await c.req.json()

    // Validate messages
    const { messages } = params
    if (!Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: 'messages must be a non-empty array' }, 400)
    }

    const validRoles = new Set(['user', 'assistant'])
    for (const msg of messages) {
      if (!(msg.role && validRoles.has(msg.role))) {
        return c.json({ error: `Invalid role "${msg.role}". Must be "user" or "assistant".` }, 400)
      }
      if (!(msg.parts || msg.content)) {
        return c.json({ error: 'Each message must have content or parts' }, 400)
      }
    }

    log.info('Chat request received', { messageCount: messages.length })
    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)

    const stream = await handleChatStream({
      mastra,
      agentId: 'operator',
      params,
      sendReasoning: true,
      sendSources: true,
    })

    log.debug('Chat stream created')
    return createUIMessageStreamResponse({ stream })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Chat request failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

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
