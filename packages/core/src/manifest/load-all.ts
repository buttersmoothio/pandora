import { registerAgentPlugin } from '../agents'
import { registerChannelPlugin } from '../channels'
import { getLogger } from '../logger'
import { registerPlugin } from '../plugins/registry'
import { registerStoragePlugin } from '../storage'
import { registerToolPlugin } from '../tools'
import { registerVectorPlugin } from '../vector'
import type { AdaptedPlugins } from './adapter'
import { adaptManifest } from './adapter'
import type { DiscoveredPlugin } from './discover'
import { discoverPlugins } from './discover'
import type { LoadedEntry } from './loader'
import { loadEntry } from './loader'
import type { PluginManifest } from './schema'
import { normalizeProvidesEntries, type ProvidesKey } from './schema'

const PROVIDES_KEYS: ProvidesKey[] = ['tools', 'agents', 'channels', 'storage', 'vector']

const registrars = {
  tools: registerToolPlugin,
  agents: registerAgentPlugin,
  channels: registerChannelPlugin,
  storage: registerStoragePlugin,
  vector: registerVectorPlugin,
} as const

async function loadPluginEntries(plugin: DiscoveredPlugin): Promise<LoadedEntry[]> {
  const entries: LoadedEntry[] = []
  for (const key of PROVIDES_KEYS) {
    for (const entry of normalizeProvidesEntries(plugin.manifest.provides[key])) {
      entries.push(await loadEntry(plugin, key, entry))
    }
  }
  return entries
}

function registerAdapted(adapted: AdaptedPlugins): void {
  for (const key of PROVIDES_KEYS) {
    const register = registrars[key]
    for (const p of adapted[key]) {
      ;(register as (p: unknown) => void)(p)
    }
  }
}

function pluginBaseFields(manifest: PluginManifest) {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    icon: manifest.icon,
    version: manifest.version,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    envVars: manifest.envVars,
    configFields: manifest.configFields,
  }
}

/**
 * Discover, load, adapt, and register all manifest-based plugins.
 */
export async function loadAllPlugins(packagesDir?: string): Promise<void> {
  const log = getLogger()
  const discovered = await discoverPlugins(packagesDir)

  log.info(`Plugin discovery: found ${discovered.length} plugin(s)`)

  for (const plugin of discovered) {
    try {
      const entries = await loadPluginEntries(plugin)
      const adapted = adaptManifest(plugin.manifest, entries)
      registerAdapted(adapted)

      const provides = PROVIDES_KEYS.filter((k) => adapted[k].length > 0)
      registerPlugin({ ...pluginBaseFields(plugin.manifest), provides })

      log.info(`Plugin loaded: ${plugin.manifest.name} (${plugin.manifest.id})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to load plugin ${plugin.manifest.id}`, { error: message })
    }
  }
}
