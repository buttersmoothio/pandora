import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getLogger } from '../logger'
import type { PluginManifest } from './schema'
import { pluginManifestSchema } from './schema'

const MANIFEST_FILENAME = 'pandora.manifest.json'

export interface DiscoveredPlugin {
  manifest: PluginManifest
  packageDir: string
  manifestPath: string
}

/**
 * Discover plugins by scanning for `pandora.manifest.json` files.
 *
 * Walks the `packages/` directory (or a custom directory) and validates
 * each manifest against the Zod schema. Invalid manifests are logged
 * and skipped. Directories without manifests are silently skipped.
 */
export async function discoverPlugins(packagesDir?: string): Promise<DiscoveredPlugin[]> {
  const log = getLogger()
  const dir = packagesDir ?? resolve(import.meta.dirname, '..', '..', '..', '..', 'packages')

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    log.warn(`Plugin discovery: could not read directory ${dir}`)
    return []
  }

  const results: DiscoveredPlugin[] = []

  for (const entry of entries) {
    const packageDir = join(dir, entry)
    const manifestPath = join(packageDir, MANIFEST_FILENAME)

    let raw: string
    try {
      raw = await readFile(manifestPath, 'utf-8')
    } catch {
      // No manifest — silently skip
      continue
    }

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      log.warn(`Plugin discovery: invalid JSON in ${manifestPath}`)
      continue
    }

    const result = pluginManifestSchema.safeParse(json)
    if (!result.success) {
      const issues = result.error.issues.map((i) =>
        i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message,
      )
      log.warn(`Plugin discovery: invalid manifest ${manifestPath}`, { issues })
      continue
    }

    results.push({ manifest: result.data, packageDir, manifestPath })
    log.debug(`Plugin discovered: ${result.data.id} (${manifestPath})`)
  }

  return results
}
