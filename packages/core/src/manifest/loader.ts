import { resolve } from 'node:path'
import { getLogger } from '../logger'
import { loadInCompartment } from './compartment-loader'
import type { DiscoveredPlugin } from './discover'
import type { ProvidesEntry, ProvidesKey } from './schema'

export interface LoadedEntry {
  key: ProvidesKey
  entry: ProvidesEntry
  namespace: Record<string, unknown>
}

/**
 * Load a single provides entry.
 *
 * - `sandbox: 'host'` — direct `import()` in the host process
 * - `sandbox: 'compartment'` (default) — loaded via `@endo/compartment-mapper`
 */
export async function loadEntry(
  plugin: DiscoveredPlugin,
  key: ProvidesKey,
  entry: ProvidesEntry,
): Promise<LoadedEntry> {
  const log = getLogger()
  const entryPath = resolve(plugin.packageDir, entry.entry)
  const sandbox = key === 'agents' || key === 'channels' ? 'host' : (entry.sandbox ?? 'compartment')

  let namespace: Record<string, unknown>

  if (sandbox === 'host') {
    log.debug(`Plugin ${plugin.manifest.id}: loading "${entry.entry}" in host mode`)
    namespace = (await import(entryPath)) as Record<string, unknown>
  } else {
    log.debug(`Plugin ${plugin.manifest.id}: loading "${entry.entry}" in compartment`)
    namespace = await loadInCompartment({
      packageDir: plugin.packageDir,
      entryPath,
      permissions: entry.permissions,
      envVars: process.env as Record<string, string | undefined>,
      pluginId: plugin.manifest.id,
    })
  }

  return { key, entry, namespace }
}
