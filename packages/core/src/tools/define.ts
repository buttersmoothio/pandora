import { createTool, type Tool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  DEFAULT_TOOL_TIMEOUT,
  type ToolExport,
  type ToolManifest,
  type ToolPluginConfig,
  type ToolRecord,
} from './types'

// --- Manifest registry ---

// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
type AnyTool = Tool<any, any, any, any, any, any>

const manifestRegistry = new Map<string, ToolManifest>()

/** Retrieve the Pandora manifest for a tool by ID, tool instance, or tool definition. */
export function getManifest(toolOrId: string | { id: string }): ToolManifest | undefined {
  const id = typeof toolOrId === 'string' ? toolOrId : toolOrId.id
  return manifestRegistry.get(id)
}

/** Retrieve all manifests for a ToolRecord. */
export function getManifests(tools: ToolRecord): Record<string, ToolManifest> {
  const result: Record<string, ToolManifest> = {}
  for (const id of Object.keys(tools)) {
    const manifest = manifestRegistry.get(id)
    if (manifest) result[id] = manifest
  }
  return result
}

/** Return all registered manifests keyed by tool ID. */
export function getAllManifests(): Record<string, ToolManifest> {
  return Object.fromEntries(manifestRegistry)
}

/** Register a pre-built manifest (e.g. from a ToolExport). */
export function registerManifest(manifest: ToolManifest): void {
  manifestRegistry.set(manifest.id, manifest)
}

/** Remove a single manifest from the registry. */
export function removeManifest(id: string): void {
  manifestRegistry.delete(id)
}

/** Clear the manifest registry. Useful for testing. */
export function clearManifestRegistry(): void {
  manifestRegistry.clear()
}

// --- buildManifest ---

/**
 * Build a ToolManifest from a ToolExport.
 *
 * Note: `sandbox` defaults to `'compartment'`. When host-mode plugins
 * adopt ToolExport, add an optional sandbox override parameter.
 */
export function buildManifest(exp: ToolExport): ToolManifest {
  return {
    id: exp.id,
    name: exp.name,
    description: exp.description,
    permissions: exp.permissions,
    sandbox: exp.sandbox ?? 'compartment',
    annotations: exp.annotations,
    timeout: exp.timeout ?? DEFAULT_TOOL_TIMEOUT,
  }
}

// --- bindToolExport ---

/** Bind a ToolExport to env/config and produce a Mastra Tool instance. */
export function bindToolExport(
  exp: ToolExport,
  envVars: Record<string, string | undefined>,
  _pluginConfig: ToolPluginConfig,
): AnyTool {
  const timeout = exp.timeout ?? DEFAULT_TOOL_TIMEOUT
  const inputSchema = exp.parameters ? z.fromJSONSchema(exp.parameters) : z.object({})
  return createTool({
    id: exp.id,
    description: exp.description,
    inputSchema,
    execute: (input) => {
      const result = exp.execute(input, { env: envVars })
      return Promise.race([
        result,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tool '${exp.id}' timed out after ${timeout}ms`)),
            timeout,
          ),
        ),
      ])
    },
    ...(exp.annotations && { mcp: { annotations: exp.annotations } }),
  })
}
