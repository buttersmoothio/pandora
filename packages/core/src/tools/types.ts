import type { ToolsInput } from '@mastra/core/agent'
import type { ConfigFieldDescriptor, EnvVarDescriptor } from '@pandorakit/sdk'
import type {
  ResolveToolsContext,
  ResolveToolsResult,
  SandboxMode,
  Tool,
  ToolPermissions,
} from '@pandorakit/sdk/tools'

/** A record of tool instances keyed by tool ID. Accepts Mastra tools, Vercel AI SDK tools, and provider-defined tools. */
export type ToolRecord = ToolsInput

/** Default tool execution timeout in milliseconds (60 seconds). */
export const DEFAULT_TOOL_TIMEOUT = 60_000

/** Plugin descriptor for tool packages */
export interface ToolPlugin {
  /** Unique plugin identifier, e.g. '@pandorakit/datetime' */
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
  /** Tool definitions provided by this plugin */
  // biome-ignore lint/suspicious/noExplicitAny: variance — Tool<T> must be assignable here for any T
  tools: Tool<any, any>[]
  /** Async hook for dynamic tool resolution based on env/config. */
  resolveTools?: (ctx: ResolveToolsContext) => Promise<ResolveToolsResult>
}
