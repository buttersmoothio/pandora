/**
 * Public API for tool authors.
 *
 * Import from `@pandora/core/tools` to define tools in external packages.
 */

export type { DefineToolOptions, ToolDefinition } from './define'
export { defineTool, getAllManifests, getManifest, getManifests } from './define'
export type {
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  GetToolsContext,
  PluginConfig,
  SandboxMode,
  ToolAnnotations,
  ToolExecuteContext,
  ToolFactory,
  ToolManifest,
  ToolPackageFactory,
  ToolPackagePlugin,
  ToolPermissions,
  ToolPlugin,
  ToolPluginConfig,
  ToolRecord,
} from './types'
export { DEFAULT_TOOL_TIMEOUT } from './types'
