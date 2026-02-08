/**
 * Web Search Subagent (Native) - Uses models with built-in web search
 *
 * This agent uses search-enabled models that have native web search capabilities:
 * - Perplexity Sonar models (perplexity/sonar-pro, perplexity/sonar)
 * - OpenAI search models (openai/gpt-4o-mini-search-preview) - uses web_search tool
 * - Google Gemini models (google/gemini-2.0-flash) - uses googleSearch tool
 *
 * Advantages:
 * - Faster (single model call)
 * - No additional API costs beyond the model
 * - Search is tightly integrated with response generation
 *
 * Disadvantages:
 * - Limited to specific models
 * - Less control over search parameters
 *
 * @see https://ai-sdk.dev/cookbook/node/web-search-agent#perplexity
 * @see https://ai-sdk.dev/cookbook/node/web-search-agent#using-native-web-search
 */

import { z } from "zod";
import type { Tool } from "ai";
import { defineSubagent, type AIConfig } from "@pandora/core";

/**
 * Detect which provider-specific tools to include based on model prefix.
 *
 * - Perplexity models: No tools needed (search is built-in)
 * - OpenAI models: Uses openai.tools.webSearch()
 * - Google/Gemini models: Uses google.tools.googleSearch()
 */
async function getProviderTools(config: AIConfig): Promise<Record<string, Tool>> {
  const agentConfig = config.agents.webSearchNative;
  if (!agentConfig) {
    return {};
  }

  const model = agentConfig.model;

  // Perplexity Sonar models have built-in search, no tools needed
  if (model.startsWith("perplexity/")) {
    return {};
  }

  // OpenAI search models use the web_search tool
  if (model.startsWith("openai/") && model.includes("search")) {
    try {
      // @ts-expect-error — optional peer dependency, resolved at runtime
      const { openai } = await import("@ai-sdk/openai");
      return {
        web_search: openai.tools.webSearch({}),
      };
    } catch {
      console.warn(
        "webSearchNative: OpenAI search model detected but @ai-sdk/openai not available. " +
          "Install it with: bun add @ai-sdk/openai"
      );
      return {};
    }
  }

  // Google/Gemini models can use googleSearch tool
  if (model.startsWith("google/") || model.startsWith("gemini/")) {
    try {
      // @ts-expect-error — optional peer dependency, resolved at runtime
      const { google } = await import("@ai-sdk/google");
      return {
        google_search: google.tools.googleSearch({}),
      };
    } catch {
      console.warn(
        "webSearchNative: Google model detected but @ai-sdk/google not available. " +
          "Install it with: bun add @ai-sdk/google"
      );
      return {};
    }
  }

  // Unknown provider - no built-in search tools
  console.warn(
    `webSearchNative: Model '${model}' may not have built-in search capabilities. ` +
      "Consider using webSearchTool with an external search backend instead."
  );
  return {};
}

export default defineSubagent({
  name: "webSearchNative",
  configKey: "webSearchNative",

  instructions: `You are a web search specialist with real-time internet access.
Your responses are grounded in current web data.

When answering:
- Search for the most recent and relevant information
- Cite your sources when possible (include URLs from search results)
- Clearly indicate when information might be outdated or uncertain
- For time-sensitive queries, prioritize recency over comprehensiveness
- If you have access to a search tool, use it to find information`,

  toolDescription:
    "Search the web using a model with native search capabilities (Perplexity, OpenAI search, Gemini). Best for: current events, recent news, real-time information.",

  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query or question requiring live web search"),
  }),

  inputField: "query",

  // Provider-specific tools based on model (async for dynamic imports)
  getTools: (config: AIConfig) => getProviderTools(config),
});

// Export the async version for direct use if needed
export { getProviderTools };
