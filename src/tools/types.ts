/**
 * Tool module types for the modular tool system
 */

import type { Tool } from "ai";

/**
 * Tool-specific configuration (varies per tool)
 * Each tool defines its own config schema in its create function
 */
export type ToolConfig = Record<string, unknown>;

/**
 * Supported agent names (hardcoded subagents)
 * Add new subagents here
 */
export type AgentName = "operator" | "coder" | "research";

/**
 * A tool definition returned by each tool module's create function
 */
export interface ToolDefinition {
  /** The AI SDK tool instance */
  tool: Tool;
  /** Human-readable name for logging */
  name: string;
  /**
   * List of agents this tool supports.
   * Omitting this field means the tool is available to ALL agents.
   * Setting it restricts the tool to only the specified agents.
   */
  agents?: AgentName[];
}

/**
 * Factory function signature -- takes optional tool-specific config, returns a ToolDefinition
 */
export type ToolFactory = (config?: ToolConfig) => ToolDefinition;
