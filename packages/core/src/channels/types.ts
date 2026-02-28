import type { MastraMessagePart } from '@mastra/core/agent/message-list'
import type {
  FileChunk,
  LanguageModelUsage,
  ReasoningChunk,
  SourceChunk,
  ToolCallChunk,
  ToolResultChunk,
} from '@mastra/core/stream'

export type { ConfigFieldDescriptor, EnvVarDescriptor } from '../plugin-types'

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
  handle(request: Request, runtime: ChannelGateway): Promise<Response>
}

/** Realtime integration — Pandora maintains persistent connection */
export interface ChannelRealtime {
  start(runtime: ChannelGateway): Promise<void>
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

// ---------------------------------------------------------------------------
// Channel gateway (the interface core provides to channel adapters)
// ---------------------------------------------------------------------------

/** Pending tool approval info returned when finishReason is 'suspended' */
export interface PendingToolApproval {
  toolCallId: string
  toolName: string
  args: unknown
}

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
  runId?: string
  pendingToolApproval?: PendingToolApproval
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
export interface ChannelGateway {
  /** Send message and get full response (non-streaming) */
  generate(opts: {
    threadId: string
    parts: MessagePart[]
    /** Pass channelId + externalId to consume pending thread metadata */
    channelId?: string
    externalId?: string
  }): Promise<GenerateResult>

  /** Send message and get streaming response */
  stream(opts: {
    threadId: string
    parts: MessagePart[]
    /** Pass channelId + externalId to consume pending thread metadata */
    channelId?: string
    externalId?: string
  }): Promise<StreamResult>

  /** Approve a pending tool call and resume generation */
  approveToolCall(opts: { runId: string; toolCallId?: string }): Promise<GenerateResult>

  /** Decline a pending tool call and resume generation */
  declineToolCall(opts: { runId: string; toolCallId?: string }): Promise<GenerateResult>

  /** Get or create an active thread for a channel+externalId pair */
  resolveThread(channelId: string, externalId: string): Promise<string>

  /** Start a new conversation for a channel+externalId pair */
  newThread(channelId: string, externalId: string): string

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
