import '../ses-lockdown'

import { pathToFileURL } from 'node:url'
import { loadFromMap } from '@endo/compartment-mapper/import-lite.js'
import { defaultParserForLanguage } from '@endo/compartment-mapper/import-parsers.js'
import { mapNodeModules } from '@endo/compartment-mapper/node-modules.js'
import tsBlankSpace from 'ts-blank-space'
import type { ToolPermissions } from '../tools/types'
import { buildPluginEndowments } from './plugin-endowments'
import { getReadPowers } from './read-powers'

const HAS_EXT = /\.\w+$/

/**
 * Rewrite bare relative imports so the compartment-mapper can resolve them.
 * `from './foo'` → `from './foo.ts'` (skips paths that already have an extension).
 * Also handles dynamic `import('./foo')` → `import('./foo.ts')`.
 *
 * Known limitation: doesn't handle directory imports (e.g. `from './utils'` where
 * `utils/index.ts` exists). Not needed for current plugins.
 */
export function addTsExtensions(source: string): string {
  return source.replace(
    /((?:from|import)\s*\(?\s*['"])(\.\.?\/[^'"]*?)(['"])/g,
    (_, before: string, path: string, after: string) => {
      if (HAS_EXT.test(path)) return `${before}${path}${after}`
      return `${before}${path}.ts${after}`
    },
  )
}

/** TypeScript → JavaScript transform for compartment-mapper's syncModuleTransforms. */
const tsTransform = (
  bytes: Uint8Array,
  _specifier: string,
  _location: string,
  _packageLocation: string,
) => {
  const source = new TextDecoder().decode(bytes)
  const js = addTsExtensions(tsBlankSpace(source))
  return { bytes: new TextEncoder().encode(js), parser: 'mjs' as const }
}

/**
 * Parser for language 'ts': delegates to the mjs parser after the ts transform runs.
 * The compartment-mapper requires a parser entry for every language in the extension map.
 */
const parserForLanguage = {
  ...defaultParserForLanguage,
  ts: defaultParserForLanguage.mjs,
}

export interface LoadInCompartmentOptions {
  /** Absolute path to the plugin's package directory. */
  packageDir: string
  /** Relative entry path (e.g. `./src/index.ts`). */
  entryPath: string
  /** Declared permissions from the manifest. */
  permissions?: ToolPermissions
  /** Environment variables snapshot. */
  envVars: Record<string, string | undefined>
}

/**
 * Load a plugin entry point inside an SES Compartment via `@endo/compartment-mapper`.
 *
 * The plugin's TypeScript is erased by `ts-blank-space` (preserving line numbers).
 * Only declared permissions are endowed as globals — zero exit modules.
 *
 * @returns The module's namespace (exports).
 */
export async function loadInCompartment(
  opts: LoadInCompartmentOptions,
): Promise<Record<string, unknown>> {
  const readPowers = getReadPowers()

  // Convert entry to file:// URL (compartment-mapper expects URLs)
  const entryUrl = pathToFileURL(opts.entryPath).href

  // Build hardened globals from declared permissions
  const globals = buildPluginEndowments(opts.permissions ?? {}, opts.envVars)

  const mapOptions = {
    parserForLanguage,
    workspaceModuleLanguageForExtension: { ts: 'ts' } as Record<string, string>,
    languages: Object.keys(parserForLanguage),
  }

  const compartmentMap = await mapNodeModules(readPowers, entryUrl, mapOptions)

  const app = await loadFromMap(readPowers, compartmentMap, {
    globals,
    parserForLanguage,
    syncModuleTransforms: { ts: tsTransform },
  })

  const result = await (app as { import: (o?: object) => Promise<unknown> }).import({ globals })

  const ns = (result as { namespace: Record<string, unknown> }).namespace ?? result
  return ns as Record<string, unknown>
}
