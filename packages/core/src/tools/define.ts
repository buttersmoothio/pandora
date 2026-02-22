import { createTool, type Tool } from '@mastra/core/tools'
import type { z } from 'zod'
import {
  DEFAULT_TOOL_TIMEOUT,
  type SandboxMode,
  type ToolAnnotations,
  type ToolExecuteContext,
  type ToolManifest,
  type ToolPermissions,
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
  for (const [id, tool] of Object.entries(tools)) {
    const manifest = manifestRegistry.get(tool.id)
    if (manifest) result[id] = manifest
  }
  return result
}

/** Return all registered manifests keyed by tool ID. */
export function getAllManifests(): Record<string, ToolManifest> {
  return Object.fromEntries(manifestRegistry)
}

/** Clear the manifest registry. Useful for testing. */
export function clearManifestRegistry(): void {
  manifestRegistry.clear()
}

// --- ToolDefinition ---

/**
 * A tool definition returned by `defineTool`.
 *
 * Call with `(env, config)` to produce a bound Mastra tool instance.
 * The `id` property is available immediately for manifest lookups.
 */
export interface ToolDefinition {
  (env: Record<string, string | undefined>, config: ToolPluginConfig): AnyTool
  readonly id: string
}

// --- defineTool ---

export interface DefineToolOptions<TIn, TOut> {
  /** Unique tool identifier. */
  id: string
  /** Human-readable display name. */
  name: string
  /** What the tool does (shown to the LLM). */
  description: string
  /** Zod schema for input validation. */
  inputSchema: z.ZodType<TIn>
  /** Optional Zod schema for output validation. */
  outputSchema?: z.ZodType<TOut>
  /** The tool's execute function. Receives `{ env, config }` as the second argument. */
  execute: (input: TIn, context: ToolExecuteContext) => Promise<TOut>
  /** Declared permissions — what capabilities this tool requires. */
  permissions?: ToolPermissions
  /** Sandbox mode. Defaults to `'compartment'`. */
  sandbox?: SandboxMode
  /** Execution timeout in milliseconds. Defaults to 60 000 (60 s). */
  timeout?: number
  /** Whether the tool requires explicit user approval before execution. */
  requireApproval?: boolean
  /** MCP-compatible annotations for UI hints. */
  annotations?: ToolAnnotations
}

/**
 * Define a Pandora tool with a permission manifest.
 *
 * Registers the manifest immediately and returns a `ToolDefinition` —
 * a callable `(env, config) => Tool` that produces a bound Mastra tool.
 */
export function defineTool<TIn, TOut>(opts: DefineToolOptions<TIn, TOut>): ToolDefinition {
  const timeout = opts.timeout ?? DEFAULT_TOOL_TIMEOUT

  const manifest: ToolManifest = {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    ...(opts.permissions && { permissions: opts.permissions }),
    sandbox: opts.sandbox ?? 'compartment',
    annotations: opts.annotations,
    timeout,
  }

  manifestRegistry.set(opts.id, manifest)

  return Object.assign(
    (env: Record<string, string | undefined>, config: ToolPluginConfig): AnyTool => {
      // Re-register manifest in case registry was cleared between define and call
      manifestRegistry.set(opts.id, manifest)
      return createTool({
        id: opts.id,
        description: opts.description,
        inputSchema: opts.inputSchema,
        outputSchema: opts.outputSchema,
        execute: (input, _mastraCtx) => {
          const result = opts.execute(input, { env, config })
          return Promise.race([
            result,
            new Promise<never>((_resolve, reject) => {
              setTimeout(
                () => reject(new Error(`Tool '${opts.id}' timed out after ${timeout}ms`)),
                timeout,
              )
            }),
          ])
        },
        requireApproval: opts.requireApproval,
        ...(opts.annotations && {
          mcp: { annotations: opts.annotations },
        }),
      })
    },
    { id: opts.id } as const,
  )
}
