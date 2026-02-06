/**
 * Tavily web search tool -- uses Tavily's search API
 *
 * Get an API key at https://tavily.com/
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolConfig, ToolDefinition } from "./types";

interface TavilyResponse {
  id: string;
  query: string;
  answer: string;
  images: string[];
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

export function createTavilySearchTool(config?: ToolConfig): ToolDefinition {
  const apiKey = config?.apiKey as string | undefined;

  if (!apiKey) {
    throw new Error("tavilySearch tool requires 'apiKey' in config");
  }

  return {
    name: "tavilySearch",
    tool: tool({
      description: "Search the web for current information using Tavily's search API. Useful for finding recent news, facts, and up-to-date information.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().min(1).max(10).optional().default(5).describe("Maximum number of results to return"),
      }),
      execute: async ({ query, maxResults = 5 }) => {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults,
            include_answer: true,
            include_images: false,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Tavily API error: ${response.status} - ${error}`);
        }

        const data: TavilyResponse = await response.json();

        return {
          query: data.query,
          answer: data.answer,
          results: data.results.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
          })),
        };
      },
    }),
  };
}
