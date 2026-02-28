import { Hono } from 'hono'
import { createRateLimiter } from '../auth/rate-limit'
import { getLogger } from '../logger'
import { createGateways } from '../runtime/gateways'
import type { Env } from './helpers'

const webhookRoutes = new Hono<Env>()

webhookRoutes.use('/*', createRateLimiter({ max: 60, windowMs: 60_000 }))

webhookRoutes.all('/:channel', async (c) => {
  const log = getLogger()
  const channelId = c.req.param('channel')

  try {
    const runtime = c.var.runtime
    const adapter = runtime.channels.get(channelId)

    if (!adapter?.webhook) {
      return c.json({ error: 'Channel not found or has no webhook support' }, 404)
    }

    // Verify signature BEFORE constructing gateway
    const verified = await adapter.webhook.verify(c.req.raw, c.var.envVars)
    if (!verified) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const { channel } = createGateways({ mastra: runtime.mastra, env: c.var.envVars })
    const response = adapter.webhook.handle(c.req.raw, channel(channelId))

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error(`Webhook error for channel ${channelId}`, { error: message })
    return c.json({ error: message }, 500)
  }
})

export { webhookRoutes }
