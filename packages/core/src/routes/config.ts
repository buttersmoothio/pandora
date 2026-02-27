import { Hono } from 'hono'
import { z } from 'zod'
import { reloadChannels } from '../channels'
import { clearConfigCache, getConfig, resetConfig, updateConfig } from '../config'
import { getLogger } from '../logger'
import { clearMastraCache, getMastra } from '../mastra'
import { getStorage } from '../storage'
import type { Env } from './helpers'

const configRoutes = new Hono<Env>()

// Config endpoint - get current config
configRoutes.get('/', async (c) => {
  const log = getLogger()
  try {
    const { config: configStore } = await getStorage(c.var.envVars, c.env)
    const config = await getConfig(configStore)
    return c.json(config)
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
    const { config: configStore } = await getStorage(c.var.envVars, c.env)
    const patch = await c.req.json()
    const updated = await updateConfig(configStore, patch)
    // Invalidate caches and rebuild everything — many subsystems depend on each other
    clearConfigCache()
    clearMastraCache()
    const mastra = await getMastra(c.var.envVars, c.env)
    await reloadChannels(mastra, c.var.envVars, updated.channels)
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
configRoutes.delete('/', async (c) => {
  const log = getLogger()
  try {
    const { config: configStore } = await getStorage(c.var.envVars, c.env)
    const config = await resetConfig(configStore)
    // Rebuild everything with default config
    clearMastraCache()
    const mastra = await getMastra(c.var.envVars, c.env)
    await reloadChannels(mastra, c.var.envVars, config.channels)
    return c.json(config)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Config reset failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

export { configRoutes }
