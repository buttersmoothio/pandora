import { Hono } from 'hono'
import { z } from 'zod'
import { updateConfig } from '../config'
import { getLogger } from '../logger'
import type { Env } from './helpers'

const configRoutes: Hono<Env> = new Hono<Env>()

// Config endpoint - get current config
configRoutes.get('/', async (c) => {
  const log = getLogger()
  try {
    return c.json(c.var.runtime.config)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('[config] fetch failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Config endpoint - update config
configRoutes.patch('/', async (c) => {
  const log = getLogger()
  try {
    const runtime = c.var.runtime
    const patch = await c.req.json()
    await updateConfig(runtime.storage.config, patch, runtime.registry)
    await runtime.reload()
    log.info('[config] updated', { keys: Object.keys(patch) })
    return c.json(runtime.config)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error('[config] validation failed', { issues: messages })
      return c.json({ error: messages.join(', ') }, 400)
    }
    const message = err instanceof Error ? err.message : 'Invalid config'
    log.error('[config] update failed', { error: message })
    return c.json({ error: message }, 400)
  }
})

export { configRoutes }
