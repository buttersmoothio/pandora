/**
 * Tavily web search tool - Uses @tavily/ai-sdk for direct AI SDK integration
 *
 * Get an API key at https://tavily.com/
 */

import { tavilySearch } from "@tavily/ai-sdk";
import { defineTool, type ToolConfig } from "../core/registries/tools";

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
