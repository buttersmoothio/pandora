import { Hono } from 'hono'
import { z } from 'zod'
import { resetConfig, updateConfig } from '../config'
import { getLogger } from '../logger'
import type { Env } from './helpers'

const configRoutes = new Hono<Env>()

// Config endpoint - get current config
configRoutes.get('/', async (c) => {
  const log = getLogger()
  try {
    return c.json(c.var.runtime.config)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Config fetch failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Config endpoint - update config
configRoutes.patch('/', async (c) => {
  const log = getLogger()
  try {
    const runtime = c.var.runtime
    const patch = await c.req.json()
    await updateConfig(runtime.storage.config, patch)
    await runtime.reload()
    log.info('Config updated', { keys: Object.keys(patch) })
    return c.json(runtime.config)
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
configRoutes.delete('/', async (c) => {
  const log = getLogger()
  try {
    const runtime = c.var.runtime
    await resetConfig(runtime.storage.config)
    await runtime.reload()
    return c.json(runtime.config)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Config reset failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

export { configRoutes }
