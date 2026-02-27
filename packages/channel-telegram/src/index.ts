import type { ChannelFactory } from '@pandora/core/channels'
import { createTelegramAdapter } from './adapter'

export const factory: ChannelFactory = (env, config) => {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  return createTelegramAdapter(token, config.ownerId as string)
}
