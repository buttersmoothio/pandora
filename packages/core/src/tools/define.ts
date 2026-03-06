import { createTool, type Tool as MastraTool } from '@mastra/core/tools'
import type { PluginConfig, Tool, ToolManifest } from '@pandorakit/sdk/tools'
import { z } from 'zod'
import { createPluginConsole } from './sandbox/endowments'
import { DEFAULT_TOOL_TIMEOUT } from './types'

// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
type AnyTool = MastraTool<any, any, any, any, any, any>

// --- buildManifest ---

/**
 * Build a ToolManifest from a Tool definition.
 */
export function buildManifest(def: Tool): ToolManifest {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    permissions: def.permissions,
    sandbox: def.sandbox ?? 'compartment',
    annotations: def.annotations,
    timeout: def.timeout ?? DEFAULT_TOOL_TIMEOUT,
  }
}

// --- bindTool ---

/** Bind a Tool definition to env/config and produce a Mastra Tool instance. */
export function bindTool(
  def: Tool,
  envVars: Record<string, string | undefined>,
  _pluginConfig: PluginConfig,
  namespacedId: string,
): AnyTool {
  const toolId = namespacedId
  const timeout = def.timeout ?? DEFAULT_TOOL_TIMEOUT
  const inputSchema = def.parameters ? z.fromJSONSchema(def.parameters) : z.object({})
  return createTool({
    id: toolId,
    description: def.description,
    inputSchema,
    execute: (input) => {
      const pluginId = namespacedId.split(':')[0]
      const result = def.execute(input, { env: envVars, logger: createPluginConsole(pluginId) })
      return Promise.race([
        result,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tool '${toolId}' timed out after ${timeout}ms`)),
            timeout,
          ),
        ),
      ])
    },
    mcp: { annotations: def.annotations },
  })
}
