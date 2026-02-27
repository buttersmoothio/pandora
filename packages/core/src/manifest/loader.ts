import { resolve } from 'node:path'
import { getLogger } from '../logger'
import type { DiscoveredPlugin } from './discover'
import type { ProvidesEntry, ProvidesKey } from './schema'

export interface LoadedEntry {
  key: ProvidesKey
  entry: ProvidesEntry
  namespace: Record<string, unknown>
}

/**
 * Load a single provides entry via dynamic `import()`.
 *
 * Resolves the entry path relative to the plugin's package directory.
 */
export async function loadEntry(
  plugin: DiscoveredPlugin,
  key: ProvidesKey,
  entry: ProvidesEntry,
): Promise<LoadedEntry> {
  const log = getLogger()
  const entryPath = resolve(plugin.packageDir, entry.entry)

  if (entry.sandbox === 'compartment') {
    log.debug(
      `Plugin ${plugin.manifest.id}: entry "${entry.entry}" declares sandbox: 'compartment' ` +
        '— loading in host mode (compartment-mapper integration pending)',
    )
  }

  const namespace = (await import(entryPath)) as Record<string, unknown>

  return { key, entry, namespace }
}
