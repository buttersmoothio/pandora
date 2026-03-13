import { getLogger } from '../logger'
import type { PluginRegistry } from '../runtime/plugin-registry'
import { createPluginRegistry } from '../runtime/plugin-registry'
import { adaptManifest } from './adapter'
import type { DiscoveredPlugin } from './discover'
import { discoverPlugins } from './discover'
import type { LoadedEntry } from './loader'
import { loadEntry } from './loader'
import type { ProvidesKey } from './schema'
import { normalizeProvidesEntries } from './schema'

const PROVIDES_KEYS: ProvidesKey[] = ['tools', 'agents', 'channels']

async function loadPluginEntries(plugin: DiscoveredPlugin): Promise<LoadedEntry[]> {
  const entries: LoadedEntry[] = []
  for (const key of PROVIDES_KEYS) {
    for (const entry of normalizeProvidesEntries(plugin.manifest.provides[key])) {
      entries.push(await loadEntry(plugin, key, entry))
    }
  }
  return entries
}

/**
 * Discover, load, adapt, and register all manifest-based plugins.
 * Returns an immutable PluginRegistry.
 */
export async function loadAllPlugins(packagesDir?: string): Promise<PluginRegistry> {
  const log = getLogger()
  const discovered = await discoverPlugins(packagesDir)
  const registry = createPluginRegistry()

  log.info('[manifest] discovery complete', { count: discovered.length })

  for (const plugin of discovered) {
    try {
      if (registry.plugins.has(plugin.manifest.id)) {
        log.warn('[manifest] skipping duplicate', { pluginId: plugin.manifest.id })
        continue
      }

      const entries = await loadPluginEntries(plugin)
      const registered = adaptManifest(plugin.manifest, entries)
      registry.plugins.set(registered.id, registered)

      log.info('[manifest] loaded', { name: plugin.manifest.name, pluginId: plugin.manifest.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('[manifest] failed to load', { pluginId: plugin.manifest.id, error: message })
    }
  }

  return registry
}
