import { createTool, type Tool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  DEFAULT_TOOL_TIMEOUT,
  type ToolExport,
  type ToolManifest,
  type ToolPluginConfig,
} from './types'

// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
type AnyTool = Tool<any, any, any, any, any, any>

// --- buildManifest ---

/**
 * Build a ToolManifest from a ToolExport.
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
