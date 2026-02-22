import { createTool, type Tool } from '@mastra/core/tools'
import type { z } from 'zod'
import type {
  SandboxMode,
  ToolAnnotations,
  ToolExecuteContext,
  ToolManifest,
  ToolPermissions,
  ToolPluginConfig,
  ToolRecord,
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
  const manifest: ToolManifest = {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    ...(opts.permissions && { permissions: opts.permissions }),
    sandbox: opts.sandbox ?? 'compartment',
    annotations: opts.annotations,
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
        execute: (input, _mastraCtx) => opts.execute(input, { env, config }),
        requireApproval: opts.requireApproval,
        ...(opts.annotations && {
          mcp: { annotations: opts.annotations },
        }),
      })
    },
    { id: opts.id } as const,
  )
}
