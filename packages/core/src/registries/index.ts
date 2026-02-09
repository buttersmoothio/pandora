/**
 * Core Registries - Extension point infrastructure
 *
 * This module exports all registry functions for the framework.
 * User extensions import from these registries to self-register.
 */

// Subagent registry
export {
  type SubagentDefinition,
  type SubagentContext,
  defineSubagent,
  getSubagentDefinitions,
  getSubagentDefinition,
  createSubagentFromDefinition,
  createSubagentTool,
  createStreamingSubagentTool,
} from "./subagents";

// Channel registry
export {
  type Channel,
  type ChannelCapabilities,
  type BaseChannelConfig,
  type ChannelFactory,
  defineChannel,
  getChannelFactories,
  createChannels,
} from "./channels";

// Tool registry
export {
  type ToolConfig,
  type AgentName,
  type ToolDefinition,
  type ToolFactory,
  type ToolRegistration,
  defineTool,
  getAvailableToolNames,
  createToolsForAgent,
} from "./tools";

// Store registry
export {
  type IMessageStore,
  type ConversationInfo,
  type MessageMeta,
  type StoreFactory,
  defineStore,
  getAvailableStoreTypes,
  createStore,
} from "./store";

// Search tools registry
export {
  type SearchToolFactory,
  type SearchToolRegistration,
  defineSearchTool,
  getAvailableSearchBackends,
  isSearchBackend,
  getSearchTool,
  getSearchBackendDescription,
  validateSearchBackend,
} from "./search-tools";
