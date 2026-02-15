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

import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import pkg from '../package.json'
import { getConfig, resetConfig, updateConfig } from './config'
import { getRuntimeKey, isServerless } from './env'
import { getStorage, getSupportedProviders } from './storage'

// Bindings type for Cloudflare Workers
type Bindings = {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

// Create Hono app
const app = new Hono<{ Bindings: Bindings }>()

// Middleware
app.use('*', logger())
app.use('*', cors())

// Health check - returns runtime info
app.get('/', (c) => {
  return c.json({
    name: 'Pandora',
    version: pkg.version,
    runtime: getRuntimeKey(),
    serverless: isServerless(),
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

// Storage info endpoint
app.get('/api/storage', async (c) => {
  const envVars = extractStringEnv(env(c))
  const provider = envVars.STORAGE_PROVIDER ?? 'libsql'

  return c.json({
    provider,
    supported: getSupportedProviders(),
    serverless: isServerless(),
  })
})

// Initialize storage endpoint (useful for testing)
app.post('/api/storage/init', async (c) => {
  try {
    const envVars = extractStringEnv(env(c))
    const { mastra } = await getStorage(envVars, c.env)
    return c.json({
      success: true,
      provider: envVars.STORAGE_PROVIDER ?? 'libsql',
      id: mastra.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
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
  try {
    const envVars = extractStringEnv(env(c))
    const { config: configStore } = await getStorage(envVars, c.env)
    const patch = await c.req.json()
    const updated = await updateConfig(configStore, patch)
    return c.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid config'
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

// Telegram webhook - placeholder
app.post('/wh/telegram', async (c) => {
  return c.json({
    message: 'Telegram webhook - not yet implemented',
    todo: ['Verify webhook secret', 'Parse Telegram update', 'Route to agent'],
  })
})

// Cron endpoint - placeholder
app.post('/api/cron/:taskId', async (c) => {
  const taskId = c.req.param('taskId')
  return c.json({
    message: 'Cron endpoint - not yet implemented',
    taskId,
    todo: ['Authenticate request', 'Execute scheduled task'],
  })
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
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
