import type { Config } from '../config'
import type { ToolPackageFactory, ToolRecord } from './types'

export { defineTool, getAllManifests, getManifest, getManifests } from './define'
export type { CompartmentExecuteOptions, Endowments } from './sandbox'
export { executeInCompartment } from './sandbox'
export type {
  SandboxMode,
  ToolAnnotations,
  ToolManifest,
  ToolPackageFactory,
  ToolPermissions,
  ToolRecord,
} from './types'

/** Standard library tool packages, imported as `@pandora/tools-${name}` */
const STDLIB_PACKAGES = ['datetime'] as const

/**
 * Import all stdlib tool packages so their `defineTool` calls run
 * and manifests are registered. Safe to call multiple times — dynamic
 * imports are cached by the module system.
 */
export async function ensureStdlibImported(): Promise<void> {
  for (const name of STDLIB_PACKAGES) {
    try {
      await import(`@pandora/tools-${name}`)
    } catch {
      // Package not installed — skip silently
    }
  }
}

/**
 * Load all tools from standard library packages, filtered by config.
 *
 * Only tools explicitly enabled in config (`config.tools[id].enabled === true`)
 * are included. The default config determines which stdlib tools are on.
 */
export async function loadTools(
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  const result: ToolRecord = {}

  for (const name of STDLIB_PACKAGES) {
    try {
      const mod = (await import(`@pandora/tools-${name}`)) as {
        createTools: ToolPackageFactory
      }
      const tools = mod.createTools(envVars)
      for (const [id, tool] of Object.entries(tools)) {
        if (config.tools[id]?.enabled) {
          result[id] = tool
        }
      }
    } catch {
      // Package not installed — skip silently
    }
  }

  return result
}
