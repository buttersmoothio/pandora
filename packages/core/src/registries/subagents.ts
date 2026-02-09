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
import type { IMessageStore } from "./store";
import type { StreamEvent, MessageMeta, TextUIPart, DynamicToolUIPart } from "../types";

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
 * Context passed to streaming subagent tools for thread management.
 */
export interface SubagentContext {
  /** Parent conversation ID */
  parentConversationId: string;
  /** Message store for persistence */
  store: IMessageStore;
  /** Callback for emitting stream events to the client */
  onEvent: (event: StreamEvent) => Promise<void>;
  /** Message metadata (channel, user) */
  meta?: MessageMeta;
}

/**
 * Create an operator delegation tool from a subagent definition.
 * @deprecated Use createStreamingSubagentTool for thread support
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

/**
 * Create a streaming subagent tool factory.
 * Returns a function that creates a Tool with the given context bound.
 *
 * @param definition - The subagent definition
 * @param subagent - The created ToolLoopAgent
 * @param config - AI config (for logging)
 * @returns Factory function that creates the tool with context
 */
export function createStreamingSubagentTool(
  definition: SubagentDefinition,
  subagent: ToolLoopAgent,
  config: AIConfig
): (ctx: SubagentContext, toolCallId: string) => Tool {
  const agentConfig = config.agents[definition.configKey as keyof typeof config.agents];
  if (!agentConfig) {
    throw new Error(`No config found for subagent: ${definition.configKey}`);
  }

  return (ctx: SubagentContext, toolCallId: string) => {
    return tool({
      description: definition.toolDescription,
      inputSchema: definition.inputSchema,
      execute: async (input, { abortSignal }) => {
        const startTime = Date.now();
        logger.subagentStart(definition.name, "gateway", agentConfig.model);

        // Get the prompt from input
        const inputRecord = input as Record<string, unknown>;
        const keys = Object.keys(inputRecord);
        const promptField = definition.inputField ?? keys[0] ?? "";
        const prompt = promptField ? String(inputRecord[promptField] ?? "") : "";

        // Create child conversation for this subagent thread
        const threadId = await ctx.store.createSubagentConversation(
          ctx.parentConversationId,
          toolCallId,
          definition.name,
          ctx.meta
        );

        // Emit subagent-start event
        await ctx.onEvent({
          type: "subagent-start",
          threadId,
          toolCallId,
          subagentName: definition.name,
        });

        // Create user message in child thread with the delegated task
        const userMessageId = await ctx.store.createMessage(threadId, "user", ctx.meta);
        await ctx.store.appendPart(userMessageId, {
          type: "text",
          text: prompt,
          state: "done",
        } as TextUIPart);

        // Create assistant message shell
        const assistantMessageId = await ctx.store.createMessage(threadId, "assistant", ctx.meta);

        logger.modelInput(definition.name, [{ role: "user", content: prompt }]);

        // Stream the subagent response
        const result = await subagent.stream({ prompt, abortSignal });

        let fullText = "";
        let hasStartedTextPart = false;

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta":
              fullText += part.text;

              // Persist text part
              if (!hasStartedTextPart) {
                await ctx.store.appendPart(assistantMessageId, {
                  type: "text",
                  text: part.text,
                  state: "streaming",
                } as TextUIPart);
                hasStartedTextPart = true;
              } else {
                await ctx.store.updateTextPart(assistantMessageId, fullText);
              }

              // Emit regular text-delta with threadId
              await ctx.onEvent({
                type: "text-delta",
                text: part.text,
                threadId,
              });
              break;

            case "tool-call":
              // Persist tool call part
              const toolPart: DynamicToolUIPart = {
                type: "dynamic-tool",
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                state: "input-available",
                input: part.input,
              };
              await ctx.store.appendPart(assistantMessageId, toolPart);

              // Emit regular tool-call with threadId
              await ctx.onEvent({
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
                threadId,
              });
              break;

            case "tool-result":
              // Update tool result
              await ctx.store.updateToolResult(assistantMessageId, part.toolCallId, part.output);

              // Emit regular tool-result with threadId
              await ctx.onEvent({
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                result: part.output,
                threadId,
              });
              break;

            case "reasoning-delta":
              // Emit regular reasoning-delta with threadId
              await ctx.onEvent({
                type: "reasoning-delta",
                text: part.text,
                threadId,
              });
              break;

            case "source":
              // Handle sources with threadId
              if (part.sourceType === "url") {
                await ctx.onEvent({
                  type: "source-url",
                  sourceId: part.id,
                  url: part.url,
                  title: part.title,
                  threadId,
                });
              } else if (part.sourceType === "document") {
                await ctx.onEvent({
                  type: "source-document",
                  sourceId: part.id,
                  mediaType: part.mediaType,
                  title: part.title,
                  filename: part.filename,
                  threadId,
                });
              }
              break;
          }
        }

        // Finalize the assistant message
        await ctx.store.finalizeMessage(assistantMessageId);

        // Emit subagent-done event
        await ctx.onEvent({
          type: "subagent-done",
          threadId,
        });

        logger.modelOutput(definition.name, fullText);
        logger.subagentComplete(definition.name, Date.now() - startTime);

        // Return both the text and the threadId
        return { text: fullText, threadId };
      },
    });
  };
}
