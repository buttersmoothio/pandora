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
} from "ai";

// UIMessagePart with default type parameters for simpler usage
import type {
  UIMessagePart as AIUIMessagePart,
  UIDataTypes,
  UITools,
} from "ai";

/** Message part type with default generics for ease of use. */
export type UIMessagePart = AIUIMessagePart<UIDataTypes, UITools>;

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
  | { type: "step-finish"; usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; finishReason: string; threadId?: string }
  | { type: "file"; mediaType: string; url: string; filename?: string; threadId?: string }
  // Subagent lifecycle events (UI sets up/tears down thread listeners)
  | { type: "subagent-start"; threadId: string; toolCallId: string; subagentName: string }
  | { type: "subagent-done"; threadId: string };

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
