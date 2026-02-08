/**
 * @pandora/core - Pandora AI Agent Framework
 *
 * This package provides the core framework for building AI agents.
 * Use this to create your own agents, tools, channels, and storage backends.
 */

// Core classes
export { Agent } from "./agent";
export { Gateway } from "./gateway";

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
  type LogLevel,
  type TelegramConfig,
} from "./config";

// Extension loader
export { loadExtensions, loadChannels } from "./loader";

// Logging
export { logger } from "./logger";

// AI providers
export { createModel } from "./providers";

// Types
export type {
  Message,
  ChatMessage,
  Attachment,
  MessageHandler,
  StreamingMessageHandler,
  ChannelCapabilities,
  Channel,
} from "./types";

// Registries - all extension points
export * from "./registries";
