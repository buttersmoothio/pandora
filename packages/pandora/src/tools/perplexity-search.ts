/**
 * Perplexity Search tool - Uses @perplexity-ai/ai-sdk for direct AI SDK integration
 *
 * This is the Perplexity Search API (tool-based), different from Perplexity Sonar models.
 * Use this with any model to add web search capabilities.
 *
 * Get an API key at https://www.perplexity.ai/account/api/keys
 *
 * @see https://ai-sdk.dev/cookbook/node/web-search-agent#perplexity-search
 */

import { perplexitySearch } from "@perplexity-ai/ai-sdk";
import { defineTool, defineSearchTool, type ToolConfig } from "@pandora/core";

// Register as a regular tool
export default defineTool({
  name: "perplexitySearch",
  factory: (config?: ToolConfig) => {
    const apiKey = config?.apiKey as string | undefined;

    if (!apiKey) {
      throw new Error("perplexitySearch tool requires 'apiKey' in config");
    }

    return {
      name: "perplexitySearch",
      tool: perplexitySearch({ apiKey }),
    };
  },
});

// Also register as a search backend for webSearchTool subagent
defineSearchTool({
  name: "perplexitySearch",
  description: "Perplexity Search API with real-time web search and advanced filtering",
  factory: (config?: ToolConfig) => {
    const apiKey = config?.apiKey as string | undefined;
    if (!apiKey) {
      throw new Error("perplexitySearch requires 'apiKey' in config");
    }
    return perplexitySearch({ apiKey });
  },
});
