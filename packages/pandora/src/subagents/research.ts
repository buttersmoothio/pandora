/**
 * Research Subagent - Specialized agent for information gathering
 *
 * Handles research tasks including:
 * - Answering factual questions
 * - Explaining concepts
 * - Providing information and summaries
 */

import { z } from "zod";
import { defineSubagent } from "@pandora/core";

export default defineSubagent({
  name: "research",
  configKey: "research",

  instructions: `You are a research assistant. Help with:
- Answering factual questions
- Explaining concepts
- Providing information and summaries

Be thorough but concise. Cite sources when relevant.`,

  toolDescription:
    "Delegate research tasks: information gathering, fact-checking, explanations",

  inputSchema: z.object({
    query: z.string().describe("The research question or topic"),
  }),

  inputField: "query",
});
