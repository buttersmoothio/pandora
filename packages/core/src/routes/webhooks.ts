import { Hono } from 'hono'
import { createRateLimiter } from '../auth/rate-limit'
import { getChannel, handleWebhook, verifyWebhook } from '../channels'
import { createChannelRuntime } from '../channels/runtime'
import { getLogger } from '../logger'
import { getMastra } from '../mastra'
import type { Env } from './helpers'
import { ensureChannelsLoaded } from './helpers'

const webhookRoutes = new Hono<Env>()

webhookRoutes.use('/*', createRateLimiter({ max: 60, windowMs: 60_000 }))

webhookRoutes.all('/:channel', async (c) => {
  const log = getLogger()
  const channelId = c.req.param('channel')

  try {
    const envVars = c.var.envVars
    await ensureChannelsLoaded(envVars)

    const adapter = getChannel(channelId)
    if (!adapter?.webhook) {
      return c.json({ error: 'Channel not found or has no webhook support' }, 404)
    }

    // Verify signature BEFORE constructing runtime
    const verified = await verifyWebhook(channelId, c.req.raw, envVars)
    if (!verified) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const mastra = await getMastra(envVars, c.env)
    const runtime = createChannelRuntime({ mastra, env: envVars })
    const response = handleWebhook(channelId, c.req.raw, runtime)

    if (!response) {
      return c.json({ error: 'Channel webhook handler unavailable' }, 404)
    }

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error(`Webhook error for channel ${channelId}`, { error: message })
    return c.json({ error: message }, 500)
  }
})

export { webhookRoutes }
