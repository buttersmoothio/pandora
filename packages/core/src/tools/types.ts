import type { ToolsInput } from '@mastra/core/agent'
import type {
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  PluginConfig,
  ResolveToolsContext,
  ResolveToolsResult,
} from '../plugin-types'

export type {
  Alert,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  PluginConfig,
  ResolveToolsContext,
  ResolveToolsResult,
} from '../plugin-types'

/** Per-plugin user configuration for tool plugins */
export type ToolPluginConfig = PluginConfig

/** A record of tool instances keyed by tool ID. Accepts Mastra tools, Vercel AI SDK tools, and provider-defined tools. */
export type ToolRecord = ToolsInput

// --- Sandbox mode ---

/**
 * How a tool's code is executed.
 *
 * - `'compartment'` — code evaluated inside an SES Compartment.
 *   Only endowed capabilities are available. Default for generated/external tools.
 * - `'host'` — TypeScript function runs in host process with full access.
 *   Required for built-in tools that use closures or imports.
 */
export type SandboxMode = 'compartment' | 'host'

// --- Permission groups (Android-style) ---

/**
 * Declares what capabilities a tool requires.
 * Allow-list only — tools start with zero authority.
 *
 * Used in `'compartment'` mode to determine what gets endowed into the SES Compartment.
 */
export interface ToolPermissions {
  /** Access to `Date`, `Date.now()`, and `Intl.DateTimeFormat`. */
  time?: boolean
  /** HTTP/HTTPS network access — list of allowed hostnames. */
  network?: string[]
  /** Environment variable read access — list of allowed key names. */
  env?: string[]
  /** Filesystem read access — list of allowed directory prefixes. */
  fs?: string[]
  /** Access to `Math.random()`. Cryptographic randomness is never available. */
  random?: boolean
}

/** Default tool execution timeout in milliseconds (60 seconds). */
export const DEFAULT_TOOL_TIMEOUT = 60_000

/**
 * Complete metadata manifest for a Pandora tool.
 * Attached to every tool regardless of sandbox mode.
 */
export interface ToolManifest {
  /** Unique tool identifier (matches the Mastra tool id). */
  id: string
  /** Human-readable display name. */
  name: string
  /** Human-readable description. */
  description: string
  /**
   * What capabilities this tool requires.
   * Required for `'compartment'` mode (drives SES endowments).
   * Optional for `'host'` mode (not runtime-enforced).
   */
  permissions?: ToolPermissions
  /** Where this tool's code executes. */
  sandbox: SandboxMode
  /** MCP-compatible annotations for UI hints. */
  annotations?: ToolAnnotations
  /** Execution timeout in milliseconds. Defaults to 60 000 (60 s). */
  timeout: number
}

/** MCP-compatible annotations describing tool behavior. */
export interface ToolAnnotations {
  /** Display title for the tool in UI. */
  title?: string
  /** Tool does not modify state (safe to run without confirmation). */
  readOnlyHint?: boolean
  /** Tool may perform destructive/irreversible operations. */
  destructiveHint?: boolean
  /** Calling with same args produces no additional effect. */
  idempotentHint?: boolean
}

/** Plugin descriptor for tool packages */
export interface ToolPlugin {
  /** Unique plugin identifier, e.g. 'tools-datetime' */
  id: string
  /** Human-readable display name, e.g. 'Date & Time' */
  name: string
  /** Human-readable description from the manifest. */
  description?: string
  /** Author of the plugin. */
  author?: string
  /** Icon URL or path. */
  icon?: string
  /** Semver version string. */
  version?: string
  /** Homepage URL. */
  homepage?: string
  /** Source repository URL. */
  repository?: string
  /** SPDX license identifier. */
  license?: string
  /** Schema version — must match core's expected version */
  schemaVersion: number
  /** Environment variables this plugin depends on */
  envVars?: EnvVarDescriptor[]
  /** Config field descriptors for the UI */
  configFields?: ConfigFieldDescriptor[]
  /** Sandbox mode declared in the manifest provides entry. */
  sandbox?: SandboxMode
  /** Permissions declared in the manifest provides entry. */
  permissions?: ToolPermissions
  /** Tool exports provided by this plugin */
  // biome-ignore lint/suspicious/noExplicitAny: variance — ToolExport<T> must be assignable here for any T
  tools: ToolExport<any, any>[]
  /** Async hook for dynamic tool resolution based on env/config. Returns ToolExport objects that go through bindToolExport() + registerManifest(). */
  resolveTools?: (ctx: ResolveToolsContext) => Promise<ResolveToolsResult>
}

/**
 * The standard tool export interface for all plugins.
 *
 * No framework dependencies — only type-only imports from `@pandora/core`.
 * The core wraps these into Mastra tools at load time.
 */
export interface ToolExport<TIn = unknown, TOut = unknown> {
  id: string
  name: string
  description: string
  /** JSON Schema for input validation. */
  parameters?: Record<string, unknown>
  /** MCP-compatible annotations. */
  annotations?: ToolAnnotations
  /** Execution timeout in ms. */
  timeout?: number
  /** Sandbox mode — stamped by the manifest adapter from the provides entry. */
  sandbox?: SandboxMode
  /** Permission declarations — stamped by the manifest adapter from the provides entry. */
  permissions?: ToolPermissions
  execute: (input: TIn, context: { env: Record<string, string | undefined> }) => Promise<TOut>
}
