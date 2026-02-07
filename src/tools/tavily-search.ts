/**
 * Tavily web search tool - Uses @tavily/ai-sdk for direct AI SDK integration
 *
 * Get an API key at https://tavily.com/
 *
 * @see https://ai-sdk.dev/cookbook/node/web-search-agent#tavily
 */

import { tavilySearch } from "@tavily/ai-sdk";
import { defineTool, type ToolConfig } from "../core/registries/tools";
import { defineSearchTool } from "../core/registries/search-tools";

// Register as a regular tool
export default defineTool({
  name: "tavilySearch",
  factory: (config?: ToolConfig) => {
    const apiKey = config?.apiKey as string | undefined;

    if (!apiKey) {
      throw new Error("tavilySearch tool requires 'apiKey' in config");
    }

    return {
      name: "tavilySearch",
      tool: tavilySearch({ apiKey }),
    };
  },
});

// Also register as a search backend for webSearchTool subagent
defineSearchTool({
  name: "tavilySearch",
  description: "Tavily AI-powered web search with high-quality results",
  factory: (config?: ToolConfig) => {
    const apiKey = config?.apiKey as string | undefined;
    if (!apiKey) {
      throw new Error("tavilySearch requires 'apiKey' in config");
    }
    return tavilySearch({ apiKey });
  },
});
