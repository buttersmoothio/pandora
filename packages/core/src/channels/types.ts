import type { Mastra } from '@mastra/core'
import type { MastraMessagePart } from '@mastra/core/agent/message-list'
import type {
  FileChunk,
  LanguageModelUsage,
  ReasoningChunk,
  SourceChunk,
  ToolCallChunk,
  ToolResultChunk,
} from '@mastra/core/stream'
// ---------------------------------------------------------------------------
// Config field descriptors (UI rendering hints for channel-specific settings)
// ---------------------------------------------------------------------------

/** Describes a config field for UI rendering */
export interface ConfigFieldDescriptor {
  /** Field key in config object, e.g. 'ownerId' */
  key: string
  /** Human-readable label, e.g. 'Owner ID' */
  label: string
  /** HTML input type hint */
  type: 'text' | 'number' | 'password'
  /** Whether this field is required */
  required?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Help text shown below the input */
  description?: string
}

// Re-export Mastra types so channel packages only import from @pandora/core/channels
export type {
  FileChunk,
  LanguageModelUsage,
  MastraMessagePart,
  ReasoningChunk,
  SourceChunk,
  ToolCallChunk,
  ToolResultChunk,
}

/**
 * Alias for MastraMessagePart — the standard message part type
 * used by channels to send user input to the core.
 */
export type MessagePart = MastraMessagePart

// ---------------------------------------------------------------------------
// Channel adapter (what channel packages export)
// ---------------------------------------------------------------------------

/** Webhook integration — platform sends HTTP to Pandora */
export interface ChannelWebhook {
  /** Verify request signature. Called before handle(). Return false to reject with 401. */
  verify(request: Request, env: Record<string, string | undefined>): Promise<boolean>
  handle(request: Request, runtime: ChannelRuntime): Promise<Response>
}

/** Realtime integration — Pandora maintains persistent connection */
export interface ChannelRealtime {
  start(runtime: ChannelRuntime): Promise<void>
  stop(): Promise<void>
}

/** A channel adapter — the unit that channel packages export */
export interface ChannelAdapter {
  /** Unique channel identifier, e.g. 'telegram' */
  id: string
  /** Human-readable name, e.g. 'Telegram' */
  name: string
  /** Webhook mode — platform pushes HTTP requests to Pandora */
  webhook?: ChannelWebhook
  /** Realtime mode — Pandora opens a persistent connection */
  realtime?: ChannelRealtime
}

/**
 * Factory function exported by `@pandora/channel-*` packages.
 * Receives env vars and validated channel config.
 * Returns `null` when required env vars (e.g. bot token) are missing.
 */
export type ChannelFactory = (
  env: Record<string, string | undefined>,
  config: ChannelConfig,
) => ChannelAdapter | null

/** Plugin descriptor for channel packages */
export interface ChannelPlugin {
  /** Unique plugin identifier, e.g. 'channel-telegram' */
  id: string
  /** Human-readable display name, e.g. 'Telegram' */
  name: string
  /** Schema version — must match core's expected version */
  schemaVersion: number
  /** Required environment variable names, e.g. ['TELEGRAM_BOT_TOKEN'] */
  envVars: string[]
  /** Config field descriptors for the UI (beyond `enabled`). Also used to generate Zod validation. */
  configFields?: ConfigFieldDescriptor[]
  /** Factory that creates a channel adapter from env vars and config */
  factory: ChannelFactory
}

// ---------------------------------------------------------------------------
// Channel runtime (the gateway — what core provides to channels)
// ---------------------------------------------------------------------------

/** Non-streaming result — all fields resolved */
export interface GenerateResult {
  text: string
  sources: SourceChunk[]
  toolCalls: ToolCallChunk[]
  toolResults: ToolResultChunk[]
  files: FileChunk[]
  reasoning: ReasoningChunk[]
  reasoningText?: string
  usage: LanguageModelUsage
}

/** Streaming result — live text stream + promise-based fields */
export interface StreamResult {
  textStream: ReadableStream<string>
  text: Promise<string>
  sources: Promise<SourceChunk[]>
  toolCalls: Promise<ToolCallChunk[]>
  toolResults: Promise<ToolResultChunk[]>
  files: Promise<FileChunk[]>
  reasoning: Promise<ReasoningChunk[]>
  reasoningText: Promise<string | undefined>
  usage: Promise<LanguageModelUsage>
}

/** The gateway — what core provides to channel adapters */
export interface ChannelRuntime {
  /** Send message and get full response (non-streaming) */
  generate(opts: { threadId: string; parts: MessagePart[] }): Promise<GenerateResult>

  /** Send message and get streaming response */
  stream(opts: { threadId: string; parts: MessagePart[] }): Promise<StreamResult>

  /** Get or create an active thread for a channel+externalId pair */
  resolveThread(channelId: string, externalId: string): Promise<string>

  /** Start a new conversation for a channel+externalId pair, returns threadId */
  newThread(channelId: string, externalId: string): Promise<string>

  /** Environment variables */
  env: Record<string, string | undefined>
}

// ---------------------------------------------------------------------------
// Channel config
// ---------------------------------------------------------------------------

/** Per-channel configuration in the Pandora config file */
export interface ChannelConfig {
  enabled: boolean
  [key: string]: unknown
}

/** Internal: loaded channel with its adapter */
export interface LoadedChannel {
  adapter: ChannelAdapter
  config: ChannelConfig | undefined
}

/** Internal: dependencies for creating a channel runtime */
export interface ChannelRuntimeDeps {
  mastra: Mastra
  env: Record<string, string | undefined>
}
