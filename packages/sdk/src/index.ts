/**
 * @pandorakit/sdk — the Pandora SDK.
 *
 * Exports types and interfaces for building tools, agents, and channel
 * adapters.
 *
 * For API response types, use `@pandorakit/sdk/api`.
 * For a typed HTTP client, use `@pandorakit/sdk/client`.
 *
 * @packageDocumentation
 */

export type { Agent, AgentManifest } from './agents'
export type {
  Channel,
  ChannelFactory,
  ChannelGateway,
  ChannelRealtime,
  ChannelWebhook,
  FileData,
  FilePart,
  GenerateResult,
  MessagePart,
  PendingToolApproval,
  Reasoning,
  Source,
  StreamResult,
  TextPart,
  ToolCall,
  ToolResult,
  Usage,
} from './channels'
export type {
  Alert,
  ConfigFieldDescriptor,
  EnvVarDescriptor,
  Logger,
  PluginConfig,
  ResolveToolsContext,
} from './common'
export type {
  ResolveToolsResult,
  SandboxMode,
  Tool,
  ToolAnnotations,
  ToolManifest,
  ToolPermissions,
} from './tools'
