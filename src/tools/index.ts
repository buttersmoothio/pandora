/**
 * Tool module - Modular tool system with registry
 *
 * Re-exports tool types, individual tools, and a factory function
 * that creates the correct tools based on configuration.
 */

export type { ToolConfig, ToolDefinition, ToolFactory, AgentName } from "./types";
export { createDateTimeTool } from "./datetime";
export { createTavilySearchTool } from "./tavily-search";

import type { Tool } from "ai";
import type { ToolConfig, ToolFactory, AgentName } from "./types";
import { createDateTimeTool } from "./datetime";
import { createTavilySearchTool } from "./tavily-search";

/**
 * Registry of all available tool factories.
 * Add new tools here by importing and registering their factory.
 */
const toolRegistry: Record<string, ToolFactory> = {
  datetime: createDateTimeTool,
  tavilySearch: createTavilySearchTool,
};

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

  for (const [name, factory] of Object.entries(toolRegistry)) {
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

  return tools;
}

/**
 * Get list of all available tool names from the registry
 */
export function getAvailableToolNames(): string[] {
  return Object.keys(toolRegistry);
}
