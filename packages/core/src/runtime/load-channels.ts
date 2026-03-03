import type { Channel } from '@pandorakit/sdk/channels'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { validatePluginConfig } from './config-validate'
import { namespacedKey, validateEntityId } from './namespace'
import type { PluginRegistry } from './plugin-registry'

export async function loadChannels(
  registry: PluginRegistry,
  config: Config,
  env: Record<string, string | undefined>,
): Promise<Map<string, Channel>> {
  const log = getLogger()
  const channels = new Map<string, Channel>()

  for (const [, plugin] of registry.plugins) {
    if (!plugin.channels) continue

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) continue

    try {
      const adapter = plugin.channels.factory(env, pluginConfig)
      if (!adapter) {
        log.debug(`Channel ${plugin.id} skipped (missing env vars)`)
        continue
      }

      validateEntityId('channel', plugin.id, adapter.id)
      const nsKey = namespacedKey(plugin.id, adapter.id)
      channels.set(nsKey, adapter)
      log.info(`Channel loaded: ${adapter.name} (${nsKey})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to load channel ${plugin.id}`, { error: message })
    }
  }

  return channels
}
