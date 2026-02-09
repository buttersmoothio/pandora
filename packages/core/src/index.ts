/**
 * @pandora/core - Pandora AI Agent Framework
 *
 * This package provides the core framework for building AI agents.
 * Use this to create your own agents, tools, channels, and storage backends.
 */

// Core classes
export { Agent } from "./agent";
export { Gateway, type ActiveStreamState, type ActiveThreadState } from "./gateway";

// Configuration
export {
  loadConfig,
  validateConfig,
  type Config,
  type AIConfig,
  type AgentConfig,
  type ToolConfig,
  type ChannelConfig,
  type StorageConfig,
  type MemoryConfig,
  type LogLevel,
  type TelegramConfig,
} from "./config";

// Extension loader
export { loadExtensions, loadChannels } from "./loader";

// Logging
export { logger } from "./logger";

// AI providers
export { createModel, createEmbeddingModel } from "./providers";

// Types
export type {
  Message,
  Attachment,
  MessageHandler,
  StreamingMessageHandler,
  ChannelCapabilities,
  Channel,
  StreamEvent,
  GatewayEvent,
  MessageMeta,
  // AI SDK UI types re-exported for convenience
  UIMessage,
  UIMessagePart,
  TextUIPart,
  ReasoningUIPart,
  DynamicToolUIPart,
  SourceUrlUIPart,
  SourceDocumentUIPart,
  FileUIPart,
  StepStartUIPart,
} from "./types";

// AI SDK utilities
export { generateId, convertToModelMessages } from "./types";

// Registries - all extension points
export * from "./registries";
