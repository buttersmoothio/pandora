import { Hono } from 'hono'
import { createRateLimiter } from '../auth/rate-limit'
import { getLogger } from '../logger'
import { createChannelGateway } from '../runtime/channel-gateway'
import { decodeNsKey } from '../runtime/namespace'
import type { Env } from './helpers'

const webhookRoutes: Hono<Env> = new Hono<Env>()

webhookRoutes.use('/*', createRateLimiter({ max: 60, windowMs: 60_000 }))

webhookRoutes.all('/:encodedKey', async (c) => {
  const log = getLogger()
  const nsKey = decodeNsKey(c.req.param('encodedKey'))

  try {
    const runtime = c.var.runtime
    const adapter = runtime.channels.get(nsKey)

    if (!adapter?.webhook) {
      return c.json({ error: 'Channel not found or has no webhook support' }, 404)
    }

    // Verify signature BEFORE constructing gateway
    const verified = await adapter.webhook.verify(c.req.raw, c.var.envVars)
    if (!verified) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const channel = createChannelGateway({
      mastra: runtime.mastra,
      env: c.var.envVars,
      interactiveTools: runtime.interactiveTools,
    })
    const response = adapter.webhook.handle(c.req.raw, channel(nsKey))

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error(`Webhook error for channel ${nsKey}`, { error: message })
    return c.json({ error: message }, 500)
  }
})

export { webhookRoutes }
