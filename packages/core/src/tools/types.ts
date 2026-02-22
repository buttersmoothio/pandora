import type { Tool } from '@mastra/core/tools'
import type { ConfigFieldDescriptor, PluginConfig } from '../plugin-types'

export type { ConfigFieldDescriptor, PluginConfig } from '../plugin-types'

/** Per-plugin user configuration for tool plugins */
export type ToolPluginConfig = PluginConfig

/** Context passed to a tool's `execute` function as the second argument. */
export interface ToolExecuteContext {
  env: Record<string, string | undefined>
  config: ToolPluginConfig
}

/** A record of tool instances keyed by tool ID */
// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
export type ToolRecord = Record<string, Tool<any, any, any, any, any, any>>

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

/**
 * Factory function exported by `@pandora/tools-*` packages.
 * Receives environment variables and validated plugin config,
 * and returns a record of tools.
 */
export type ToolFactory = (
  env: Record<string, string | undefined>,
  config: ToolPluginConfig,
) => ToolRecord

/** @deprecated Use `ToolFactory` */
export type ToolPackageFactory = ToolFactory

/** Plugin descriptor for tool packages */
export interface ToolPlugin {
  /** Unique plugin identifier, e.g. 'tools-datetime' */
  id: string
  /** Human-readable display name, e.g. 'Date & Time' */
  name: string
  /** Schema version — must match core's expected version */
  schemaVersion: number
  /** Required environment variable names */
  envVars?: string[]
  /** Config field descriptors for the UI */
  configFields?: ConfigFieldDescriptor[]
  /** Factory that creates tool instances from env vars */
  factory: ToolFactory
}

/** @deprecated Use `ToolPlugin` */
export type ToolPackagePlugin = ToolPlugin
