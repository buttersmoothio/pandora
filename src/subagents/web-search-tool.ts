/**
 * Web Search Subagent (Tool-based) - Uses external search API with any model
 *
 * This agent uses an external search tool (Tavily, Exa, Perplexity Search API, etc.)
 * which works with ANY model. The model calls the search tool, gets results,
 * then generates a response.
 *
 * Advantages:
 * - Works with any model (Claude, GPT-4, Gemini, Llama, etc.)
 * - More control over search parameters
 * - Can combine with other tools
 * - Choice of search backends
 *
 * Disadvantages:
 * - Requires search API key (additional cost)
 * - Slower (multiple model calls: search → process results)
 *
 * Configuration:
 * 1. Configure a search tool in ai.tools (e.g., tavilySearch, exaSearch)
 * 2. Set searchBackend in the agent config to specify which tool to use
 *
 * @see https://ai-sdk.dev/cookbook/node/web-search-agent#using-tools
 */

import { z } from "zod";
import type { Tool } from "ai";
import { defineSubagent } from "../core/registries/subagents";
import type { AIConfig } from "../core/config";
import {
  getSearchTool,
  validateSearchBackend,
  getAvailableSearchBackends,
} from "../core/registries/search-tools";

/**
 * Get the configured search tool for this subagent.
 *
 * Reads searchBackend from agent config and returns the corresponding tool.
 */
function getConfiguredSearchTool(config: AIConfig): Record<string, Tool> {
  const agentConfig = config.agents.webSearchTool as
    | { model: string; searchBackend?: string }
    | undefined;

  if (!agentConfig) {
    console.warn("webSearchTool agent is not configured");
    return {};
  }

  const searchBackend = agentConfig.searchBackend;

  if (!searchBackend) {
    const available = getAvailableSearchBackends();
    console.warn(
      `webSearchTool requires 'searchBackend' in agent config. ` +
        `Available backends: ${available.join(", ") || "none (configure a search tool first)"}`
    );
    return {};
  }

  // Validate the backend is available and configured
  const validationError = validateSearchBackend(searchBackend, config.tools ?? {});
  if (validationError) {
    console.warn(`webSearchTool: ${validationError}`);
    return {};
  }

  // Get the search tool
  const tool = getSearchTool(searchBackend, config.tools ?? {});
  if (!tool) {
    console.warn(
      `webSearchTool: Failed to create search tool '${searchBackend}'. ` +
        `Check that it's properly configured in ai.tools.`
    );
    return {};
  }

  // Return with the backend name as the tool name
  return { [searchBackend]: tool };
}

export default defineSubagent({
  name: "webSearchTool",
  configKey: "webSearchTool",

  instructions: `You are a web search specialist. You have access to a web search tool to find current information on the internet.

When answering queries:
1. Use the search tool to find relevant, up-to-date information
2. Synthesize the search results into a clear, comprehensive answer
3. Cite sources when possible (include URLs)
4. If the search doesn't return relevant results, try refining your query
5. For complex questions, you may need multiple searches

Always ground your answers in the search results. Don't make up information.`,

  toolDescription:
    "Search the web using an external search API (Tavily, Exa, Perplexity Search). Works with any model. Best for: detailed research, multiple searches, flexible backend choice.",

  inputSchema: z.object({
    query: z.string().describe("The search query or research question"),
  }),

  inputField: "query",

  // Dynamically select the configured search backend
  getTools: (config: AIConfig) => getConfiguredSearchTool(config),
});
