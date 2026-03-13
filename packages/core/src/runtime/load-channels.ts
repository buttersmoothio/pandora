import type { Channel } from '@pandorakit/sdk/channels'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { validatePluginConfig } from './config-validate'
import { namespacedKey, validateEntityId } from './namespace'
import type { PluginRegistry } from './plugin-registry'

export interface LoadChannelsResult {
  channels: Map<string, Channel>
  /** Human-friendly name → namespaced key (e.g. "Telegram" → "@pandorakit/telegram:telegram"). */
  channelNames: Map<string, string>
}

export async function loadChannels(
  registry: PluginRegistry,
  config: Config,
  env: Record<string, string | undefined>,
): Promise<LoadChannelsResult> {
  const log = getLogger()
  const channels = new Map<string, Channel>()
  const channelNames = new Map<string, string>()

  // Track name occurrences for disambiguation
  const nameCounts = new Map<string, number>()

  for (const [, plugin] of registry.plugins) {
    if (!plugin.channels) continue

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) continue

    try {
      const adapter = plugin.channels.factory(env, pluginConfig)
      if (!adapter) {
        log.debug('[load-channels] channel skipped (missing env vars)', { pluginId: plugin.id })
        continue
      }

      validateEntityId('channel', plugin.id, adapter.id)
      const nsKey = namespacedKey(plugin.id, adapter.id)
      channels.set(nsKey, adapter)

      // Build unique friendly name
      const count = nameCounts.get(adapter.name) ?? 0
      nameCounts.set(adapter.name, count + 1)
      const friendlyName = count > 0 ? `${adapter.name} (${plugin.id})` : adapter.name
      channelNames.set(friendlyName, nsKey)

      log.info('[load-channels] channel loaded', { name: adapter.name, nsKey })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('[load-channels] failed to load channel', { pluginId: plugin.id, error: message })
    }
  }

  return { channels, channelNames }
}
