/**
 * Subagent Definitions - Specialized agents that the operator can delegate to
 */

import { ToolLoopAgent, tool, type Tool } from "ai";
import { z } from "zod";
import { createModel } from "./providers";
import type { AIConfig } from "./config";
import { logger } from "./logger";

/**
 * Create the coder subagent (programming, debugging, code review).
 *
 * @param config - AI config; must have `config.agents.coder` and provider set.
 * @param tools - Optional action tools to give this subagent.
 * @returns A ToolLoopAgent configured for coding tasks.
 */
export function createCoderSubagent(
  config: AIConfig,
  tools: Record<string, Tool> = {}
): ToolLoopAgent {
  const agentConfig = config.agents.coder!;
  const providerConfig = config.providers[agentConfig.provider]!;

  let stepCount = 0;

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
    tools,
    onStepFinish: ({ toolCalls, toolResults, text, finishReason, usage }) => {
      stepCount++;

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          const matchingResult = toolResults?.find(
            (r: { toolCallId: string }) => r.toolCallId === call.toolCallId
          );
          logger.toolCall(call.toolName, {
            args: (call as Record<string, unknown>).input ?? (call as Record<string, unknown>).args,
            result: (matchingResult as Record<string, unknown> | undefined)?.output ?? (matchingResult as Record<string, unknown> | undefined)?.result,
            agentName: "coder",
          });
        }
      }

      logger.stepFinish(
        "coder",
        stepCount,
        finishReason ?? "unknown",
        text,
        toolCalls?.length,
        usage
      );
    },
  });
}

/**
 * Create the operator tool that delegates to the coder subagent.
 *
 * @param subagent - Coder subagent instance.
 * @param config - AI config (used for logging).
 * @returns Tool definition for the AI SDK.
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

      logger.modelInput("coder", [{ role: "user", content: task }]);

      const result = await subagent.generate({ prompt: task, abortSignal });

      logger.modelOutput("coder", result.text);
      logger.subagentComplete("coder", Date.now() - startTime);
      return result.text;
    },
  });
}

/**
 * Create the research subagent (information gathering, explanations).
 *
 * @param config - AI config; must have `config.agents.research` and provider set.
 * @param tools - Optional action tools to give this subagent.
 * @returns A ToolLoopAgent configured for research tasks.
 */
export function createResearchSubagent(
  config: AIConfig,
  tools: Record<string, Tool> = {}
): ToolLoopAgent {
  const agentConfig = config.agents.research!;
  const providerConfig = config.providers[agentConfig.provider]!;

  let stepCount = 0;

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
    tools,
    onStepFinish: ({ toolCalls, toolResults, text, finishReason, usage }) => {
      stepCount++;

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          const matchingResult = toolResults?.find(
            (r: { toolCallId: string }) => r.toolCallId === call.toolCallId
          );
          logger.toolCall(call.toolName, {
            args: (call as Record<string, unknown>).input ?? (call as Record<string, unknown>).args,
            result: (matchingResult as Record<string, unknown> | undefined)?.output ?? (matchingResult as Record<string, unknown> | undefined)?.result,
            agentName: "research",
          });
        }
      }

      logger.stepFinish(
        "research",
        stepCount,
        finishReason ?? "unknown",
        text,
        toolCalls?.length,
        usage
      );
    },
  });
}

/**
 * Create the operator tool that delegates to the research subagent.
 *
 * @param subagent - Research subagent instance.
 * @param config - AI config (used for logging).
 * @returns Tool definition for the AI SDK.
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

      logger.modelInput("research", [{ role: "user", content: query }]);

      const result = await subagent.generate({ prompt: query, abortSignal });

      logger.modelOutput("research", result.text);
      logger.subagentComplete("research", Date.now() - startTime);
      return result.text;
    },
  });
}
