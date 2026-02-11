/**
 * Tool Registry - Framework infrastructure for registering tools
 *
 * Tools are capabilities that agents can use (datetime, search, etc.).
 * Each tool is defined in src/tools/ and self-registers using defineTool().
 */

import type { Tool } from "ai";
import { logger } from "../logger";

/**
 * Tool-specific configuration (varies per tool)
 * Each tool defines its own config schema in its factory function
 */
export type ToolConfig = Record<string, unknown>;

/**
 * Supported agent names for tool assignment.
 * Tools can restrict themselves to specific agents.
 */
export type AgentName = string;

/**
 * A tool definition returned by each tool's factory function
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
 * Factory function signature for creating tools
 */
export type ToolFactory = (config?: ToolConfig) => ToolDefinition;

/**
 * Definition for registering a tool
 */
export interface ToolRegistration {
  /** Unique name for this tool (matches config key in ai.tools) */
  name: string;
  /** Factory function to create the tool */
  factory: ToolFactory;
}

/** Registry of all tool factories */
const registry = new Map<string, ToolFactory>();

/**
 * Register a tool factory.
 * Call this from each tool file to self-register.
 *
 * @param registration - The tool registration (name + factory)
 * @returns The same registration (for export convenience)
 */
export function defineTool(registration: ToolRegistration): ToolRegistration {
  registry.set(registration.name, registration.factory);
  logger.debug("Registry", "Tool registered", { name: registration.name });
  return registration;
}

/**
 * Get all registered tool names.
 */
export function getAvailableToolNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Create Tool instances for a specific agent.
 *
 * Iterates all configured tools and includes those that:
 * 1. Are configured in toolsConfig
 * 2. Either have no `agents` restriction (supports all) OR include the target agent
 *
 * @param agentName - The agent name to create tools for
 * @param toolsConfig - Tool configurations from ai.tools section
 * @returns Record mapping tool names to AI SDK Tool instances
 */
export function createToolsForAgent(
  agentName: AgentName,
  toolsConfig: Record<string, ToolConfig>
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const [name, factory] of registry.entries()) {
    if (!(name in toolsConfig)) {
      // Tool is not configured, skip
      continue;
    }

    const config = toolsConfig[name];
    const definition = factory(config);

    // Include if no agents restriction, or if this agent is in the list
    if (!definition.agents || definition.agents.includes(agentName)) {
      tools[definition.name] = definition.tool;
    }
  }

  logger.debug("Registry", `Created ${Object.keys(tools).length} tool(s) for agent`, { agent: agentName });
  return tools;
}
