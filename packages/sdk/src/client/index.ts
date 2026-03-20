/**
 * @pandorakit/sdk/client — typed HTTP client for the Pandora server.
 *
 * Re-exports all API types from `@pandorakit/sdk/api` plus the runtime
 * client factory and error class.
 *
 * @example
 * ```ts
 * import { createClient, type Config, type Thread } from '@pandorakit/sdk/client'
 *
 * const client = createClient({
 *   baseUrl: 'http://localhost:4111',
 *   getToken: () => localStorage.getItem('pandora_token'),
 * })
 *
 * const config = await client.config.get()
 * const { data: threads } = await client.threads.list()
 * ```
 *
 * @packageDocumentation
 */

// Re-export all API types
export type {
  AddMcpServerInput,
  AgentOverview,
  AgentsProvides,
  Alert,
  AuthTokenPair,
  BranchRef,
  ChannelsProvides,
  Config,
  ConfigFieldDescriptor,
  CreateScheduleInput,
  DeepPartial,
  DeliveryStatus,
  EnvVarDescriptor,
  ForkInfo,
  HealthResponse,
  HeartbeatCheck,
  HeartbeatConfig,
  InboxMessage,
  McpServerInfo,
  McpToolOverview,
  MessagePart,
  ModelConfig,
  OMRecord,
  OMThresholds,
  PluginProvides,
  ProviderInfo,
  RecordResponse,
  ScheduleTask,
  ServerMessage,
  Session,
  Thread,
  ThreadDetailResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ToolOverview,
  ToolPermissions,
  ToolsProvides,
  UnifiedPluginInfo,
  UpdateScheduleInput,
} from '../api-types'

// Client namespace types
export type { AuthClient } from './auth'
export type { ChatApproveInput, ChatClient, ChatSendInput } from './chat'
export type { ConfigClient } from './config'
export { createClient, type PandoraClient } from './create-client'
export type { McpServersClient, ModelsClient, PluginsClient } from './discovery'
export type { ClientOptions } from './fetch-wrapper'
export { PandoraApiError } from './fetch-wrapper'
export type { InboxClient } from './inbox'
export type { MemoryClient } from './memory'
export type { ScheduleClient } from './schedule'
export type { ThreadsClient } from './threads'
