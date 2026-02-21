import type { ChannelPlugin } from '@pandora/core/channels'
import { createTelegramAdapter } from './adapter'

export default {
  id: 'channel-telegram',
  name: 'Telegram',
  schemaVersion: 1,
  envVars: ['TELEGRAM_BOT_TOKEN'],
  configFields: [
    {
      key: 'ownerId',
      label: 'Owner ID',
      type: 'text',
      required: true,
      placeholder: '123456789',
      description: 'Your Telegram user ID. Only this user can interact with the bot.',
    },
  ],
  factory: (env, config) => {
    const token = env.TELEGRAM_BOT_TOKEN
    if (!token) return null
    return createTelegramAdapter(token, config.ownerId as string)
  },
} satisfies ChannelPlugin
