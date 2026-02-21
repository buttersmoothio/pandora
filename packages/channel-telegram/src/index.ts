import type { ChannelPlugin } from '@pandora/core/channels'
import { z } from '@pandora/core/channels'
import { createTelegramAdapter } from './adapter'

const configSchema = z.object({
  ownerId: z.string(),
})

export default {
  id: 'channel-telegram',
  schemaVersion: 1,
  configSchema,
  factory: (env, config) => {
    const token = env.TELEGRAM_BOT_TOKEN
    if (!token) return null
    return createTelegramAdapter(token, config.ownerId as string)
  },
} satisfies ChannelPlugin
