/**
 * Core types for the Pandora AI Agent
 */

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
 * Chat message for conversation history (compatible with Vercel AI SDK)
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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
 */
export type StreamEvent =
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "source"; sourceType: string; id: string; url?: string; title?: string; providerMetadata?: Record<string, unknown> }
  | { type: "reasoning-delta"; text: string }
  | { type: "step-finish"; usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; finishReason: string };

/**
 * Events emitted by the Gateway's pub/sub system for cross-channel streaming.
 * Subscribers receive these for real-time visibility into any conversation.
 */
export type GatewayEvent =
  | { type: "user-message"; conversationId: string; channelName: string; content: string }
  | { type: "delta"; conversationId: string; text: string }
  | { type: "done"; conversationId: string }
  | (StreamEvent & { conversationId: string });
