import type { Channel, ChannelFactory } from '@pandorakit/sdk/channels'
import type { PluginConfig } from '@pandorakit/sdk/tools'
import { createTelegramAdapter } from './adapter'

export const factory: ChannelFactory = (
  env: Record<string, string | undefined>,
  config: PluginConfig,
): Channel | null => {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return null
  }
  return createTelegramAdapter(token, config.ownerId as string)
}
