/**
 * Subagent Registry - Framework infrastructure for registering subagents
 *
 * Subagents are specialized agents that the operator can delegate to.
 * Each subagent is defined in a single file in src/subagents/ and
 * self-registers using defineSubagent().
 */

import { ToolLoopAgent, stepCountIs, tool, type Tool, type ToolChoice } from "ai";
import type { z } from "zod";
import { createModel } from "../providers";
import type { AIConfig } from "../config";
import { logger } from "../logger";

/**
 * Definition for a subagent.
 * Each subagent file exports a definition using defineSubagent().
 */
export interface SubagentDefinition {
  /** Unique name for this subagent (used in logging) */
  name: string;
  /** Config key in ai.agents (e.g. "coder" maps to config.ai.agents.coder) */
  configKey: string;
  /** System instructions for this subagent */
  instructions: string;
  /** Description shown to the operator when delegating */
  toolDescription: string;
  /** Zod schema for the delegation tool's input */
  inputSchema: z.ZodSchema;
  /** Input field name for the delegation prompt (defaults to first field in schema) */
  inputField?: string;
  /**
   * Optional: Override which tools this subagent receives.
   * If not provided, uses createToolsForAgent(name, config.tools).
   * Return empty object {} for no tools (e.g. search-enabled models).
   * May be async (e.g. for dynamic provider tool imports).
   */
  getTools?: (config: AIConfig) => Record<string, Tool> | Promise<Record<string, Tool>>;
}

/** Registry of all subagent definitions */
const registry = new Map<string, SubagentDefinition>();

/**
 * Register a subagent definition.
 * Call this from each subagent file to self-register.
 *
 * @param definition - The subagent definition
 * @returns The same definition (for export convenience)
 */
export function defineSubagent(definition: SubagentDefinition): SubagentDefinition {
  registry.set(definition.name, definition);
  return definition;
}

/**
 * Get all registered subagent definitions.
 * Used by the agent runtime to create subagents.
 */
export function getSubagentDefinitions(): SubagentDefinition[] {
  return Array.from(registry.values());
}

/**
 * Get a specific subagent definition by name.
 */
export function getSubagentDefinition(name: string): SubagentDefinition | undefined {
  return registry.get(name);
}

/**
 * Create a ToolLoopAgent from a subagent definition.
 *
 * @param definition - The subagent definition
 * @param config - AI config (for model creation)
 * @param tools - Tools to give this subagent
 * @returns Configured ToolLoopAgent
 */
export function createSubagentFromDefinition(
  definition: SubagentDefinition,
  config: AIConfig,
  tools: Record<string, Tool>
): ToolLoopAgent {
  const agentConfig = config.agents[definition.configKey as keyof typeof config.agents];
  if (!agentConfig) {
    throw new Error(`No config found for subagent: ${definition.configKey}`);
  }

  let stepCount = 0;

  return new ToolLoopAgent({
    model: createModel(agentConfig.model, config.gateway.apiKey),
    temperature: agentConfig.temperature,
    maxOutputTokens: agentConfig.maxOutputTokens,
    stopWhen: agentConfig.maxSteps ? stepCountIs(agentConfig.maxSteps) : undefined,
    toolChoice: agentConfig.toolChoice as ToolChoice<any> | undefined,
    instructions: definition.instructions,
    tools,
    onStepFinish: ({ toolCalls, toolResults, text, finishReason, usage }) => {
      stepCount++;

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          const matchingResult = toolResults?.find(
            (r) => r.toolCallId === call.toolCallId
          );
          logger.toolCall(call.toolName, {
            args: call.input,
            result: matchingResult?.output,
            agentName: definition.name,
          });
        }
      }

      logger.stepFinish(
        definition.name,
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
 * Create an operator delegation tool from a subagent definition.
 *
 * @param definition - The subagent definition
 * @param subagent - The created ToolLoopAgent
 * @param config - AI config (for logging)
 * @returns Tool for the operator to delegate to this subagent
 */
export function createSubagentTool(
  definition: SubagentDefinition,
  subagent: ToolLoopAgent,
  config: AIConfig
): Tool {
  const agentConfig = config.agents[definition.configKey as keyof typeof config.agents];
  if (!agentConfig) {
    throw new Error(`No config found for subagent: ${definition.configKey}`);
  }

  return tool({
    description: definition.toolDescription,
    inputSchema: definition.inputSchema,
    execute: async (input, { abortSignal }) => {
      const startTime = Date.now();
      logger.subagentStart(definition.name, "gateway", agentConfig.model);

      // Get the prompt from input - use inputField if specified, otherwise first field
      const inputRecord = input as Record<string, unknown>;
      const keys = Object.keys(inputRecord);
      const promptField = definition.inputField ?? keys[0] ?? "";
      const prompt = promptField ? String(inputRecord[promptField] ?? "") : "";

      logger.modelInput(definition.name, [{ role: "user", content: prompt }]);

      const result = await subagent.generate({ prompt, abortSignal });

      logger.modelOutput(definition.name, result.text);
      logger.subagentComplete(definition.name, Date.now() - startTime);
      return result.text;
    },
  });
}
