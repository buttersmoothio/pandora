import type { Alert, Logger } from './common'

export type {
  Alert,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  Logger,
  PluginConfig,
  ResolveToolsContext,
} from './common'

/**
 * How a tool's code is executed.
 *
 * - `'compartment'` — sandboxed execution with only declared capabilities.
 * - `'host'` — runs in the host process with full access.
 */
export type SandboxMode = 'compartment' | 'host'

/**
 * Declares what capabilities a tool requires.
 * Allow-list only — tools start with zero authority.
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

/** Complete metadata for a tool. */
export interface ToolManifest {
  /** Unique tool identifier. */
  id: string
  /** Human-readable display name. */
  name: string
  /** Human-readable description. */
  description: string
  /** What capabilities this tool requires. */
  permissions?: ToolPermissions
  /** Where this tool's code executes. */
  sandbox: SandboxMode
  /** MCP-compatible annotations for UI hints. */
  annotations?: ToolAnnotations
  /** Execution timeout in milliseconds. */
  timeout: number
}

/** A tool definition — the standard interface for all tool plugins. */
export interface Tool<TIn = unknown, TOut = unknown> {
  id: string
  name: string
  description: string
  /** JSON Schema for input validation. */
  parameters?: Record<string, unknown>
  /** MCP-compatible annotations. */
  annotations?: ToolAnnotations
  /** Execution timeout in ms. */
  timeout?: number
  /** Sandbox mode override. */
  sandbox?: SandboxMode
  /** Permission declarations. */
  permissions?: ToolPermissions
  execute: (
    input: TIn,
    context: {
      env: Record<string, string | undefined>
      logger: Logger
    },
  ) => Promise<TOut>
}

/** Result from a plugin's resolveTools hook. */
export interface ResolveToolsResult {
  tools: Tool[]
  alerts?: Alert[]
}
