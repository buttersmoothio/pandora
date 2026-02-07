/**
 * Web Search Subagent - Specialized agent for live web searches
 *
 * Uses search-enabled models like `openai/gpt-4o-mini-search-preview`
 * that have built-in web search capabilities - no explicit search tools needed.
 *
 * Handles web search tasks including:
 * - Live internet searches
 * - Current events lookup
 * - Real-time information retrieval
 */

import { z } from "zod";
import { defineSubagent } from "../core/registries/subagents";

export default defineSubagent({
  name: "webSearch",
  configKey: "webSearch",

  // No instructions needed - search-enabled models handle search internally
  instructions: "",

  toolDescription:
    "Delegate web search tasks: live internet searches, current events, real-time information lookup",

  inputSchema: z.object({
    query: z.string().describe("The search query or question requiring web search"),
  }),

  inputField: "query",

  // No tools needed - the search-enabled model handles search internally
  getTools: () => ({}),
});
