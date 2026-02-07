/**
 * Core Registries - Extension point infrastructure
 *
 * This module exports all registry functions for the framework.
 * User extensions import from these registries to self-register.
 */

// Subagent registry
export {
  type SubagentDefinition,
  defineSubagent,
  getSubagentDefinitions,
  getSubagentDefinition,
  createSubagentFromDefinition,
  createSubagentTool,
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
  isOwner,
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
  type StoreFactory,
  defineStore,
  getAvailableStoreTypes,
  createStore,
} from "./store";
