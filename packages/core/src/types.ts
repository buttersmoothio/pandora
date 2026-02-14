/**
 * Core types for the Pandora AI Agent
 */

// Re-export AI SDK UI types for message parts
export type {
  UIMessage,
  TextUIPart,
  ReasoningUIPart,
  DynamicToolUIPart,
  SourceUrlUIPart,
  SourceDocumentUIPart,
  FileUIPart,
  StepStartUIPart,
  UIDataTypes,
  UITools,
  LanguageModelUsage,
} from "ai";

// UIMessagePart with default type parameters for simpler usage
import type {
  UIMessagePart as AIUIMessagePart,
  UIDataTypes,
  UITools,
  LanguageModelUsage,
} from "ai";

/** AI SDK message part type with default generics. */
export type UIMessagePart = AIUIMessagePart<UIDataTypes, UITools>;

/** Memory context recalled for a prompt. */
export interface MemoryContextPart {
  type: "memory-context";
  facts: Array<{ content: string; category?: string; score: number }>;
  episodes: Array<{ content: string; timestamp?: number; score: number }>;
}

/** Extended message part type including Pandora-specific parts. */
export type PandoraMessagePart = UIMessagePart | MemoryContextPart;

export { generateId, convertToModelMessages } from "ai";

/**
 * Metadata attached to each Pandora message.
 */
export interface MessageMeta {
  /** Which channel this message originated from */
  channelName?: string;
  /** User identifier (channel-specific format) */
  userId?: string;
  /** Unix epoch seconds when created */
  createdAt?: number;
}

/**
 * Pandora message type - AI SDK UIMessage with our metadata.
 * Parts-based storage for tool calls, reasoning, sources, etc.
 */
export type { UIMessage as PandoraMessage } from "ai";

/**
 * Capabilities that a channel supports.
 * These are fixed characteristics of each channel, defined in code.
 */
export interface ChannelCapabilities {
  /** Can send/receive images */
  supportsImages: boolean;
  /** Can send/receive files */
  supportsFiles: boolean;
  /** Supports rich text formatting (Markdown, HTML) */
  supportsRichText: boolean;
  /** Supports interactive buttons/keyboards */
  supportsButtons: boolean;
  /** Can stream responses token-by-token */
  supportsStreaming: boolean;
  /** Character limit per message (-1 for unlimited) */
  maxMessageLength: number;
  /** Can proactively send messages to users (for scheduled tasks) */
  supportsPush: boolean;
}

/**
 * Attachment in a message (image, file, etc.)
 */
export interface Attachment {
  type: "image" | "file" | "audio" | "video";
  /** File identifier (channel-specific, e.g. Telegram file_id) */
  fileId?: string;
  /** Direct URL to the file */
  url?: string;
  /** Raw file data */
  data?: Uint8Array;
  /** MIME type of the file */
  mimeType?: string;
  /** Original filename */
  filename?: string;
  /** File size in bytes */
  size?: number;
  /** Duration in seconds (for audio/video) */
  duration?: number;
  /** Caption text (for images/files with captions) */
  caption?: string;
}

/**
 * Incoming message from a channel
 */
export interface Message {
  /** Which channel this message came from */
  channelName: string;
  /** User identifier (channel-specific format) */
  userId: string;
  /** Conversation/chat identifier */
  conversationId: string;
  /** Text content of the message */
  content: string;
  /** Optional attachments */
  attachments?: Attachment[];
  /** Message ID to reply to (for quoting) */
  replyToMessageId?: number;
  /** Channel-specific metadata */
  metadata?: Record<string, unknown>;
}


/**
 * Channel interface that all channel implementations must follow
 */
export interface Channel {
  /** Unique name for this channel */
  readonly name: string;
  /** Channel's capabilities (what it can do) */
  readonly capabilities: ChannelCapabilities;
  /** Start the channel (begin listening for messages) */
  start(): Promise<void>;
  /** Stop the channel gracefully */
  stop(): Promise<void>;
}

/**
 * Channel that supports proactive push notifications.
 * Channels with supportsPush: true should implement this interface.
 */
export interface ChannelPusher extends Channel {
  /**
   * Send a proactive message to a user.
   * Used for scheduled reminders and notifications.
   *
   * @param userId - User identifier (channel-specific format)
   * @param content - Message content to send
   */
  push(userId: string, content: string): Promise<void>;
}

/**
 * Handler function type for processing messages through the gateway
 */
export type MessageHandler = (
  message: Message,
  capabilities: ChannelCapabilities
) => Promise<string>;

/**
 * Streaming handler that yields text deltas as they arrive from the agent.
 */
export type StreamingMessageHandler = (
  message: Message,
  capabilities: ChannelCapabilities
) => AsyncGenerator<string, void>;

// Import context types for stream events
import type { ContextState, ConversationStats } from "./context/types";

/**
 * Events emitted during streaming for tool call visibility.
 * Delivered via callback alongside the text stream.
 *
 * Events can include an optional `threadId` to scope them to a subagent thread.
 * The UI routes events by threadId - null/undefined means operator, otherwise subagent.
 */
export type StreamEvent =
  | { type: "text-delta"; text: string; threadId?: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown; threadId?: string }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown; threadId?: string }
  | { type: "source-url"; sourceId: string; url: string; title?: string; providerMetadata?: Record<string, unknown>; threadId?: string }
  | { type: "source-document"; sourceId: string; mediaType: string; title: string; filename?: string; providerMetadata?: Record<string, unknown>; threadId?: string }
  | { type: "reasoning-delta"; text: string; threadId?: string }
  | { type: "step-start"; threadId?: string }
  | { type: "step-finish"; usage: LanguageModelUsage; finishReason: string; threadId?: string }
  | { type: "file"; mediaType: string; url: string; filename?: string; threadId?: string }
  // Memory context recalled for this prompt
  | {
      type: "memory-context";
      facts: Array<{ content: string; category?: string; score: number }>;
      episodes: Array<{ content: string; timestamp?: number; score: number }>;
    }
  // Subagent lifecycle events (UI sets up/tears down thread listeners)
  | { type: "subagent-start"; threadId: string; toolCallId: string; subagentName: string }
  | { type: "subagent-done"; threadId: string }
  // Context management events
  | { type: "context-state"; conversationId: string; threadId?: string; state: ContextState }
  | { type: "compaction"; conversationId: string; beforeTokens: number; afterTokens: number; removed: number; episodeId?: string }
  | { type: "conversation-stats"; conversationId: string; stats: ConversationStats };

/**
 * Events emitted by the Gateway's pub/sub system for cross-channel streaming.
 * Subscribers receive these for real-time visibility into any conversation.
 */
export type GatewayEvent =
  | { type: "user-message"; conversationId: string; channelName: string; content: string }
  | { type: "done"; conversationId: string }
  | { type: "cleared"; conversationId: string }
  | { type: "error"; conversationId: string; message: string }
  | (StreamEvent & { conversationId: string });
