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
  url?: string;
  data?: Uint8Array;
  mimeType?: string;
  filename?: string;
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
