/**
 * @pandorakit/sdk/api — API request/response types for the Pandora server.
 *
 * Types-only entrypoint with zero runtime. Import from `@pandorakit/sdk/api`
 * when you only need types (e.g. if you use your own HTTP client).
 *
 * @example
 * ```ts
 * import type { Config, Thread, InboxMessage } from '@pandorakit/sdk/api'
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Re-exports from existing SDK types
// ---------------------------------------------------------------------------

export type { MessagePart } from './channels'
export type { Alert, ConfigFieldDescriptor, EnvVarDescriptor } from './common'
export type { ToolPermissions } from './tools'

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/**
 * Recursive partial where `null` means "delete this key".
 *
 * Matches server-side deep-merge semantics used for config updates.
 * Set a field to `null` to remove an optional key; set it to a value to update it.
 *
 * @typeParam T - The full type to make deep-partial.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> | null : T[K] | null
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Access + refresh token pair returned by authentication operations.
 *
 * Returned by login, setup, refresh, and change-password operations.
 */
export interface AuthTokenPair {
  /** Short-lived JWT access token. Include as `Authorization: Bearer <token>`. */
  token: string
  /** Long-lived refresh token for obtaining new access tokens. */
  refreshToken: string
  /** ISO 8601 expiry timestamp for the access token. */
  expiresAt: string
  /** ISO 8601 expiry timestamp for the refresh token. */
  refreshExpiresAt: string
}

/** An active authentication session. */
export interface Session {
  /** Unique session identifier. */
  id: string
  /** ISO 8601 timestamp when the session was created. */
  createdAt: string
  /** ISO 8601 timestamp when the session expires. */
  expiresAt: string
  /** User-Agent string from the originating request, if available. */
  userAgent?: string
  /** IP address from the originating request, if available. */
  ip?: string
  /** Whether this is the session making the current request. */
  current?: boolean
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Server health and authentication status. */
export interface HealthResponse {
  /** Server name (always `"Pandora"`). */
  name: string
  /** Server version string. */
  version: string
  /** Runtime environment identifier (e.g. `"bun"`, `"node"`). */
  runtime: string
  /** Whether the server is running in serverless mode. */
  serverless: boolean
  /** Authentication status. */
  auth: {
    /** Whether the initial password has been configured. */
    setup: boolean
    /** Whether the current request is authenticated. */
    authenticated: boolean
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** LLM provider and model configuration for a single model slot. */
export interface ModelConfig {
  /** Provider identifier (e.g. `"openai"`, `"anthropic"`, `"google"`). */
  provider: string
  /** Model identifier within the provider (e.g. `"gpt-4o"`, `"claude-sonnet-4-5-20250514"`). */
  model: string
  /** Sampling temperature override. */
  temperature?: number
  /** Maximum output tokens override. */
  maxTokens?: number
}

/**
 * Full server configuration.
 *
 * Use {@link DeepPartial}`<Config>` for partial update requests.
 */
export interface Config {
  /** Agent identity settings. */
  identity: {
    /** Display name for the agent. */
    name: string
  }
  /** IANA timezone string (e.g. `"America/New_York"`). */
  timezone: string
  /** Agent personality configuration. */
  personality: {
    /** Custom system prompt prepended to all conversations. */
    systemPrompt: string
  }
  /** Model assignments. */
  models: {
    /** The primary model used for chat and scheduled tasks. */
    operator: ModelConfig
  }
  /** Per-plugin configuration keyed by plugin ID. */
  plugins: Record<string, { enabled: boolean; [key: string]: unknown }>
  /** MCP server configurations keyed by server ID. */
  mcpServers: Record<
    string,
    {
      /** Stdio command to launch the server process. */
      command?: string
      /** Arguments for the stdio command. */
      args?: string[]
      /** HTTP/SSE URL for remote MCP servers. */
      url?: string
      /** Whether this server is enabled. */
      enabled: boolean
      /** Human-readable display name. */
      name?: string
      /** Fine-grained permission restrictions. */
      permissions?: {
        network?: string[]
        env?: string[]
        fs?: { denyRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }
      }
      /** Whether tool calls from this server require user approval. */
      requireApproval: boolean
      /** Custom HTTP headers for remote servers. */
      headers?: Record<string, string>
      /** Whether this server uses OAuth authentication. */
      oauth?: boolean
    }
  >
  /** Observational memory settings. */
  memory: {
    /** Whether observational memory is enabled. */
    enabled: boolean
    /** Model override for memory processing (defaults to operator model). */
    model?: string
  }
  /** Scheduler settings. */
  schedule: {
    /** Whether the scheduler is enabled. */
    enabled: boolean
    /** Configured scheduled tasks (summary view). */
    tasks: Array<{
      id: string
      name: string
      cron?: string
      runAt?: string
      prompt: string
      enabled: boolean
      maxRuns?: number
    }>
  }
  /** Whether the initial setup wizard has been completed. */
  onboardingComplete: boolean
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/** A conversation thread (summary view). */
export interface Thread {
  /** Unique thread identifier. */
  id: string
  /** AI-generated thread title, if available. */
  title?: string
  /** ISO 8601 creation timestamp. */
  createdAt: string
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string
  /** Arbitrary metadata attached to the thread. */
  metadata?: Record<string, unknown>
  /** The currently active branch thread ID (for branched conversations). */
  activeThreadId?: string
  /** All branch thread IDs in this conversation tree. */
  threadIds?: string[]
}

/** A reference to a branch (fork) of a conversation. */
export interface BranchRef {
  /** Thread ID of the branch. */
  id: string
  /** Title of the branch thread, if available. */
  title?: string
}

/** Fork relationship metadata for a branched thread. */
export interface ForkInfo {
  /** Thread ID of the source (parent) thread. */
  sourceThreadId: string
  /** Message index in the source thread where the fork occurred. */
  forkPointIndex: number
  /** Sibling branches forked from the same point. */
  siblings: BranchRef[]
}

/**
 * Server-side message format.
 *
 * `parts` is typed as `unknown[]` to avoid coupling to the `ai` package.
 * Consumers narrow the parts at their integration layer (e.g. via AI SDK's `UIMessage`).
 */
export interface ServerMessage {
  /** Unique message identifier. */
  id: string
  /** Message author role. */
  role: 'user' | 'assistant' | 'system'
  /** Message content parts (AI SDK format). */
  parts: unknown[]
  /** Arbitrary metadata (e.g. tool approval state, run ID). */
  metadata?: Record<string, unknown>
}

/** Paginated thread list response. */
export interface ThreadListResponse {
  /** Array of thread summaries. */
  threads: Thread[]
  /** Total number of threads. */
  total: number
  /** Current page number (1-based). */
  page: number
  /** Items per page, or `false` if pagination is disabled. */
  perPage: number | false
  /** Whether more pages are available. */
  hasMore: boolean
  /** Thread IDs with currently active streaming responses. */
  activeStreamIds?: string[]
}

/** Full thread detail with messages and branch info. */
export interface ThreadDetailResponse {
  /** Thread metadata. */
  thread: {
    id: string
    title?: string
    createdAt: string
    updatedAt: string
    metadata?: Record<string, unknown>
  }
  /** All messages in the thread. */
  messages: ServerMessage[]
  /** Fork points — maps message ID to its child branches. */
  forks: Record<string, BranchRef[]>
  /** Fork relationship info if this thread is itself a fork, or `null`. */
  forkInfo: ForkInfo | null
}

/** Result of forking a thread. */
export interface ThreadForkResponse {
  /** The newly created fork thread. */
  thread: Thread
  /** Number of messages cloned from the source thread. */
  clonedMessageCount: number
}

// ---------------------------------------------------------------------------
// Discovery — Plugins
// ---------------------------------------------------------------------------

/** Summary of a tool provided by a plugin. */
export interface ToolOverview {
  /** Namespaced tool identifier (e.g. `"@pandorakit/tavily-search:tavily_search"`). */
  id: string
  /** Human-readable tool name. */
  name: string
  /** What the tool does. */
  description: string
}

/** Tools capability section within a plugin's provides. */
export interface ToolsProvides {
  /** Namespaced tool IDs registered by this plugin. */
  toolIds: string[]
  /** Tool summaries with name and description. */
  tools: ToolOverview[]
  /** Sandbox execution mode. */
  sandbox?: 'compartment' | 'host'
  /** Permission declarations for sandboxed tools. */
  permissions?: import('./tools').ToolPermissions
  /** Whether tool calls from this plugin require user approval. */
  requireApproval?: boolean
  /** Diagnostic alerts produced during tool loading. */
  alerts: import('./common').Alert[]
}

/** Summary of an agent provided by a plugin. */
export interface AgentOverview {
  /** Namespaced agent identifier. */
  id: string
  /** Human-readable agent name. */
  name: string
  /** What the agent does. */
  description: string
  /** Model override for this agent, if configured. */
  model?: { provider: string; model: string }
  /** Tools this agent uses. */
  tools: { id: string; name: string; description: string }[]
  /** Diagnostic alerts produced during agent loading. */
  alerts: import('./common').Alert[]
}

/** Agents capability section within a plugin's provides. */
export interface AgentsProvides {
  /** Namespaced agent IDs registered by this plugin. */
  agentIds: string[]
  /** Agent summaries. */
  agents: AgentOverview[]
  /** Diagnostic alerts. */
  alerts: import('./common').Alert[]
}

/** Channels capability section within a plugin's provides. */
export interface ChannelsProvides {
  /** Whether the channel adapter loaded successfully. */
  loaded: boolean
  /** Whether the channel supports webhook mode, or `null` if not applicable. */
  webhook: boolean | null
  /** Whether the channel supports realtime mode, or `null` if not applicable. */
  realtime: boolean | null
}

/** Aggregated capabilities a plugin provides. */
export interface PluginProvides {
  /** Tools this plugin registers. */
  tools?: ToolsProvides
  /** Agents this plugin registers. */
  agents?: AgentsProvides
  /** Channel adapters this plugin registers. */
  channels?: ChannelsProvides
}

/** Complete plugin information including capabilities and configuration status. */
export interface UnifiedPluginInfo {
  /** Plugin package identifier (e.g. `"@pandorakit/tavily-search"`). */
  id: string
  /** Human-readable plugin name. */
  name: string
  /** Plugin description. */
  description?: string
  /** Plugin author. */
  author?: string
  /** Icon identifier or URL. */
  icon?: string
  /** Package version. */
  version?: string
  /** Plugin homepage URL. */
  homepage?: string
  /** Source repository URL. */
  repository?: string
  /** License identifier. */
  license?: string
  /** Required environment variables with configuration status. */
  envVars: (import('./common').EnvVarDescriptor & { configured?: boolean })[]
  /** Whether all required environment variables are configured. */
  envConfigured: boolean
  /** Config fields for UI rendering. */
  configFields: import('./common').ConfigFieldDescriptor[]
  /** Whether the plugin is enabled. */
  enabled: boolean
  /** Current plugin configuration values. */
  config: Record<string, unknown>
  /** What this plugin provides (tools, agents, channels). */
  provides: PluginProvides
  /** Validation errors from the plugin manifest. */
  validationErrors: string[]
}

// ---------------------------------------------------------------------------
// Discovery — MCP Servers
// ---------------------------------------------------------------------------

/** Summary of a tool exposed by an MCP server. */
export interface McpToolOverview {
  /** Tool identifier. */
  id: string
  /** Human-readable tool name. */
  name: string
  /** What the tool does. */
  description: string
}

/** MCP server status and configuration. */
export interface McpServerInfo {
  /** Unique server identifier. */
  id: string
  /** Human-readable server name. */
  name: string
  /** Transport type: `"stdio"` for local processes, `"http"` for remote servers. */
  type: 'stdio' | 'http'
  /** Whether this server is enabled. */
  enabled: boolean
  /** Whether tool calls from this server require user approval. */
  requireApproval: boolean
  /** Tools currently exposed by this server. */
  tools: McpToolOverview[]
  /** Error message if the server failed to connect. */
  error?: string
  /** OAuth authorization URL if authentication is required. */
  authUrl?: string
}

/** Input for adding a new MCP server. */
export interface AddMcpServerInput {
  /** Stdio command for local server processes. */
  command?: string
  /** Arguments for the stdio command. */
  args?: string[]
  /** URL for remote HTTP/SSE MCP servers. */
  url?: string
  /** Whether to enable the server immediately. */
  enabled?: boolean
  /** Human-readable display name. */
  name?: string
  /** Environment variable names to forward to the server process. */
  env?: string[]
  /** Whether tool calls require user approval. */
  requireApproval?: boolean
  /** Custom HTTP headers for remote servers. */
  headers?: Record<string, string>
  /** Whether this server uses OAuth authentication. */
  oauth?: boolean
}

// ---------------------------------------------------------------------------
// Discovery — Models
// ---------------------------------------------------------------------------

/** LLM provider with its available models and configuration status. */
export interface ProviderInfo {
  /** Provider identifier (e.g. `"openai"`, `"anthropic"`). */
  id: string
  /** Human-readable provider name. */
  name: string
  /** Available model identifiers. */
  models: string[]
  /** Whether the provider's API key is configured. */
  configured: boolean
  /** URL to provider documentation for API key setup. */
  docUrl?: string
  /** Gateway identifier if using a proxy/gateway. */
  gateway: string
  /** Required environment variable names for this provider. */
  envVars: string[]
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** A scheduled task with its current status. */
export interface ScheduleTask {
  /** Unique task identifier. */
  id: string
  /** Human-readable task name. */
  name: string
  /** Cron expression for recurring tasks (mutually exclusive with `runAt`). */
  cron?: string
  /** ISO 8601 timestamp for one-time tasks (mutually exclusive with `cron`). */
  runAt?: string
  /** Prompt sent to the agent when the task triggers. */
  prompt: string
  /** Whether this task is enabled. */
  enabled: boolean
  /** Maximum number of runs before auto-disabling. */
  maxRuns?: number
  /** Notification destination (e.g. `"Web Inbox"` or a channel name). */
  destination?: string
  /** ISO 8601 timestamp of the next scheduled run, or `null` if not scheduled. */
  nextRun: string | null
  /** Whether the task is currently executing. */
  isRunning: boolean
}

/** Input for creating a new scheduled task. */
export interface CreateScheduleInput {
  /** Human-readable task name. */
  name: string
  /** Cron expression for recurring tasks (mutually exclusive with `runAt`). */
  cron?: string
  /** ISO 8601 timestamp for one-time tasks (mutually exclusive with `cron`). */
  runAt?: string
  /** Prompt sent to the agent when the task triggers. */
  prompt: string
  /** Whether to enable the task immediately. Defaults to `true`. */
  enabled?: boolean
  /** Maximum number of runs before auto-disabling. */
  maxRuns?: number
  /** Notification destination. */
  destination?: string
}

/**
 * Input for updating an existing scheduled task.
 *
 * Set a field to `null` to clear an optional value (e.g. remove `destination`).
 */
export interface UpdateScheduleInput {
  /** Updated task name. */
  name?: string
  /** Updated cron expression, or `null` to switch to one-time. */
  cron?: string | null
  /** Updated one-time timestamp, or `null` to switch to recurring. */
  runAt?: string | null
  /** Updated prompt. */
  prompt?: string
  /** Updated enabled state. */
  enabled?: boolean
  /** Updated max runs, or `null` to remove the limit. */
  maxRuns?: number | null
  /** Updated destination, or `null` to remove. */
  destination?: string | null
}

/** A single check within the heartbeat configuration. */
export interface HeartbeatCheck {
  /** Check identifier. */
  id: string
  /** Human-readable description of what this check does. */
  description: string
  /** Whether this check is enabled. */
  enabled: boolean
}

/** Heartbeat configuration and status. */
export interface HeartbeatConfig {
  /** Whether the heartbeat is enabled. */
  enabled: boolean
  /** Cron expression controlling heartbeat frequency. */
  cron: string
  /** Individual checks run during each heartbeat. */
  tasks: HeartbeatCheck[]
  /** Notification destination for heartbeat results. */
  destination?: string
  /** Active hours restriction (heartbeat only runs within this window). */
  activeHours?: {
    /** Start time in `HH:mm` format. */
    start: string
    /** End time in `HH:mm` format. */
    end: string
  }
  /** ISO 8601 timestamp of the next heartbeat run, or `null`. */
  nextRun: string | null
  /** Whether the heartbeat is currently executing. */
  isRunning: boolean
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** Delivery status of an inbox message. */
export type DeliveryStatus = 'pending' | 'sent' | 'failed'

/** An inbox message generated by scheduled tasks or agent notifications. */
export interface InboxMessage {
  /** Unique message identifier. */
  id: string
  /** Message subject line. */
  subject: string
  /** Message body content. */
  body: string
  /** Thread ID that generated this message, or `null` for standalone messages. */
  threadId: string | null
  /** Delivery destination (e.g. `"Web Inbox"` or a channel name). */
  destination: string
  /** Current delivery status. */
  status: DeliveryStatus
  /** Whether the message has been read. */
  read: boolean
  /** ISO 8601 creation timestamp. */
  createdAt: string
  /** ISO 8601 archive timestamp, or `null` if not archived. */
  archivedAt: string | null
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/** Observational memory record metadata. */
export interface OMRecord {
  /** Record identifier. */
  id: string
  /** Memory scope — `"resource"` for cross-thread, `"thread"` for per-thread. */
  scope: 'resource' | 'thread'
  /** Number of observation generations (processing cycles). */
  generationCount: number
  /** ISO 8601 timestamp of the last record update. */
  updatedAt: string
  /** ISO 8601 timestamp of the last observation, if any. */
  lastObservedAt?: string
  /** Current token count of stored observations. */
  observationTokenCount: number
  /** Token count of messages pending observation. */
  pendingMessageTokens: number
  /** Cumulative tokens observed across all generations. */
  totalTokensObserved: number
  /** Whether an observation cycle is currently in progress. */
  isObserving: boolean
  /** Whether a reflection cycle is currently in progress. */
  isReflecting: boolean
}

/** Token thresholds that trigger observation and reflection cycles. */
export interface OMThresholds {
  /** Memory scope these thresholds apply to. */
  scope: 'resource' | 'thread'
  /** Pending message token count that triggers an observation cycle. */
  messageTokens: number
  /** Observation token count that triggers a reflection cycle. */
  observationTokens: number
}

/** Observational memory record with metadata and thresholds. */
export interface RecordResponse {
  /** The observational memory record, or `null` if OM is not configured. */
  record: OMRecord | null
  /** Token thresholds, or `null` if OM is not configured. */
  thresholds: OMThresholds | null
}
