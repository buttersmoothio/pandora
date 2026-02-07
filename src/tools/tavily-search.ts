/**
 * Tavily web search tool -- uses @tavily/ai-sdk for direct AI SDK integration
 *
 * Get an API key at https://tavily.com/
 */

import { tavilySearch } from "@tavily/ai-sdk";
import type { ToolConfig, ToolDefinition } from "./types";

export function createTavilySearchTool(config?: ToolConfig): ToolDefinition {
  const apiKey = config?.apiKey as string | undefined;

  if (!apiKey) {
    throw new Error("tavilySearch tool requires 'apiKey' in config");
  }

  return {
    name: "tavilySearch",
    tool: tavilySearch({ apiKey }),
  };
}
