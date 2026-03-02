import type { Channel } from '../channels/types'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { validatePluginConfig } from './config-validate'
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

      channels.set(adapter.id, adapter)
      log.info(`Channel loaded: ${adapter.name} (${adapter.id})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to load channel ${plugin.id}`, { error: message })
    }
  }

  return channels
}
