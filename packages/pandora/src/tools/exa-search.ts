/**
 * Exa web search tool - Uses @exalabs/ai-sdk for direct AI SDK integration
 *
 * Exa provides AI-powered web search with advanced filtering and content extraction.
 *
 * Get an API key at https://dashboard.exa.ai/api-keys
 *
 * @see https://ai-sdk.dev/cookbook/node/web-search-agent#exa
 */

import { webSearch } from "@exalabs/ai-sdk";
import { defineTool, defineSearchTool, type ToolConfig } from "@pandora/core";

// Register as a regular tool
export default defineTool({
  name: "exaSearch",
  factory: (config?: ToolConfig) => {
    const apiKey = config?.apiKey as string | undefined;

    if (!apiKey) {
      throw new Error("exaSearch tool requires 'apiKey' in config");
    }

    return {
      name: "exaSearch",
      tool: webSearch({ apiKey }),
    };
  },
});

// Also register as a search backend for webSearchTool subagent
defineSearchTool({
  name: "exaSearch",
  description: "Exa AI-powered web search with advanced filtering and content extraction",
  factory: (config?: ToolConfig) => {
    const apiKey = config?.apiKey as string | undefined;
    if (!apiKey) {
      throw new Error("exaSearch requires 'apiKey' in config");
    }
    return webSearch({ apiKey });
  },
});
