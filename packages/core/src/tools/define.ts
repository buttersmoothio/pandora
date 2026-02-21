import { createTool, type Tool } from '@mastra/core/tools'
import type { z } from 'zod'
import type {
  SandboxMode,
  ToolAnnotations,
  ToolManifest,
  ToolPermissions,
  ToolRecord,
} from './types'

// --- Manifest registry ---

// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
type AnyTool = Tool<any, any, any, any, any, any>

const manifestRegistry = new Map<string, ToolManifest>()

/** Retrieve the Pandora manifest for a Mastra Tool. */
export function getManifest(tool: AnyTool): ToolManifest | undefined {
  return manifestRegistry.get(tool.id)
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

// --- defineTool ---

// biome-ignore lint/suspicious/noExplicitAny: execute context uses Mastra's internal types
type ExecuteContext = any

export interface DefineToolOptions<TIn, TOut> {
  /** Unique tool identifier. */
  id: string
  /** What the tool does (shown to the LLM). */
  description: string
  /** Zod schema for input validation. */
  inputSchema: z.ZodType<TIn>
  /** Optional Zod schema for output validation. */
  outputSchema?: z.ZodType<TOut>
  /** The tool's execute function. */
  execute: (input: TIn, context: ExecuteContext) => Promise<TOut>
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
 * Creates a standard Mastra Tool and registers a ToolManifest
 * in the internal Map registry (accessible via `getManifest()`).
 */
export function defineTool<TIn, TOut>(opts: DefineToolOptions<TIn, TOut>): AnyTool {
  const manifest: ToolManifest = {
    id: opts.id,
    description: opts.description,
    ...(opts.permissions && { permissions: opts.permissions }),
    sandbox: opts.sandbox ?? 'compartment',
    annotations: opts.annotations,
  }

  const tool = createTool({
    id: opts.id,
    description: opts.description,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,
    execute: opts.execute,
    requireApproval: opts.requireApproval,
    ...(opts.annotations && {
      mcp: { annotations: opts.annotations },
    }),
  })

  manifestRegistry.set(opts.id, manifest)
  return tool
}
