/**
 * Search Tool Registry - Utilities for managing search backends
 *
 * This module provides utilities for the webSearchTool subagent to
 * dynamically select and use configured search backends (Tavily, Exa, etc.).
 *
 * Search tools are regular tools registered via defineTool() in src/tools/.
 * This registry tracks which tools are search backends and provides
 * helpers to get the configured backend for an agent.
 */

import type { Tool } from "ai";
import type { ToolConfig } from "./tools";

/**
 * Factory function signature for creating search tools
 */
export type SearchToolFactory = (config?: ToolConfig) => Tool;

/**
 * Search tool registration info
 */
export interface SearchToolRegistration {
  /** Unique name matching the tool name in ai.tools config */
  name: string;
  /** Factory function to create the search tool */
  factory: SearchToolFactory;
  /** Human-readable description of this search backend */
  description: string;
}

/** Registry of search tool factories */
const searchToolRegistry = new Map<string, SearchToolRegistration>();

/**
 * Register a search tool backend.
 * Call this from each search tool file to register as a search backend.
 *
 * @param registration - The search tool registration
 * @returns The same registration (for export convenience)
 */
export function defineSearchTool(registration: SearchToolRegistration): SearchToolRegistration {
  searchToolRegistry.set(registration.name, registration);
  return registration;
}

/**
 * Get all registered search backend names.
 */
export function getAvailableSearchBackends(): string[] {
  return Array.from(searchToolRegistry.keys());
}

/**
 * Check if a tool name is a registered search backend.
 */
export function isSearchBackend(toolName: string): boolean {
  return searchToolRegistry.has(toolName);
}

/**
 * Get the search tool for a specific backend.
 *
 * @param backendName - The search backend name (e.g., "tavilySearch", "exaSearch")
 * @param toolsConfig - Tool configurations from ai.tools section
 * @returns The configured search Tool, or undefined if not found/configured
 */
export function getSearchTool(
  backendName: string,
  toolsConfig: Record<string, ToolConfig>
): Tool | undefined {
  const registration = searchToolRegistry.get(backendName);
  if (!registration) {
    return undefined;
  }

  const config = toolsConfig[backendName];
  if (!config) {
    return undefined;
  }

  return registration.factory(config);
}

/**
 * Get description of a search backend.
 */
export function getSearchBackendDescription(backendName: string): string | undefined {
  return searchToolRegistry.get(backendName)?.description;
}

/**
 * Validate that a search backend is properly configured.
 *
 * @param backendName - The search backend name
 * @param toolsConfig - Tool configurations from ai.tools section
 * @returns Error message if invalid, undefined if valid
 */
export function validateSearchBackend(
  backendName: string,
  toolsConfig: Record<string, ToolConfig>
): string | undefined {
  if (!searchToolRegistry.has(backendName)) {
    const available = getAvailableSearchBackends();
    return `Unknown search backend '${backendName}'. Available backends: ${available.join(", ") || "none registered"}`;
  }

  if (!(backendName in toolsConfig)) {
    return `Search backend '${backendName}' is not configured in ai.tools. Add it with required credentials.`;
  }

  return undefined;
}
