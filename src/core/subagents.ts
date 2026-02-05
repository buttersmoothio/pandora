/**
 * Subagent Definitions - Specialized agents that the operator can delegate to
 */

import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { createModel } from "./providers.ts";
import type { AIConfig } from "./config.ts";
import { logger } from "./logger.ts";

/**
 * Create a coding subagent for programming tasks
 */
export function createCoderSubagent(config: AIConfig): ToolLoopAgent {
  const agentConfig = config.agents.coder!;
  const providerConfig = config.providers[agentConfig.provider]!;

  return new ToolLoopAgent({
    model: createModel(
      agentConfig.provider,
      agentConfig.model,
      providerConfig.apiKey
    ),
    instructions: `You are an expert programmer. Help with coding tasks including:
- Debugging and fixing code
- Code review and suggestions
- Writing new code
- Explaining code concepts

When finished, provide a clear summary of what you did or found.`,
    tools: {
      // Future: code execution, file editing tools
    },
  });
}

/**
 * Create a tool that invokes the coder subagent
 */
export function createCoderTool(subagent: ToolLoopAgent, config: AIConfig) {
  const agentConfig = config.agents.coder!;

  return tool({
    description:
      "Delegate coding tasks: debugging, code review, implementation, code explanations",
    inputSchema: z.object({
      task: z.string().describe("The coding task to complete"),
    }),
    execute: async ({ task }, { abortSignal }) => {
      const startTime = Date.now();
      logger.subagentStart("coder", agentConfig.provider, agentConfig.model);

      const result = await subagent.generate({ prompt: task, abortSignal });

      logger.subagentComplete("coder", Date.now() - startTime);
      return result.text;
    },
  });
}

/**
 * Create a research subagent for information gathering
 */
export function createResearchSubagent(config: AIConfig): ToolLoopAgent {
  const agentConfig = config.agents.research!;
  const providerConfig = config.providers[agentConfig.provider]!;

  return new ToolLoopAgent({
    model: createModel(
      agentConfig.provider,
      agentConfig.model,
      providerConfig.apiKey
    ),
    instructions: `You are a research assistant. Help with:
- Answering factual questions
- Explaining concepts
- Providing information and summaries

Be thorough but concise. Cite sources when relevant.`,
    tools: {
      // Future: web search, document analysis tools
    },
  });
}

/**
 * Create a tool that invokes the research subagent
 */
export function createResearchTool(subagent: ToolLoopAgent, config: AIConfig) {
  const agentConfig = config.agents.research!;

  return tool({
    description:
      "Delegate research tasks: information gathering, fact-checking, explanations",
    inputSchema: z.object({
      query: z.string().describe("The research question or topic"),
    }),
    execute: async ({ query }, { abortSignal }) => {
      const startTime = Date.now();
      logger.subagentStart("research", agentConfig.provider, agentConfig.model);

      const result = await subagent.generate({ prompt: query, abortSignal });

      logger.subagentComplete("research", Date.now() - startTime);
      return result.text;
    },
  });
}
