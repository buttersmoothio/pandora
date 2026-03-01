/**
 * Public API for tool authors.
 *
 * Import from `@pandorakit/core/tools` to define tools in external packages.
 */

export type {
  Alert,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  PluginConfig,
  ResolveToolsContext,
  ResolveToolsResult,
  SandboxMode,
  ToolAnnotations,
  ToolExport,
  ToolManifest,
  ToolPermissions,
  ToolPluginConfig,
  ToolRecord,
} from './types'
export { DEFAULT_TOOL_TIMEOUT } from './types'
