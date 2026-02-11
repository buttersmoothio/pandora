/**
 * AI Agent - Operator with Subagent Architecture
 *
 * The main operator agent handles general conversation and delegates
 * specialized tasks to subagents (coding, research, etc.) via tools.
 */

import { ToolLoopAgent, stepCountIs, convertToModelMessages, type Tool, type ToolExecutionOptions } from "ai";
import { createModel } from "./providers";
import {
  getSubagentDefinitions,
  createSubagentFromDefinition,
  createStreamingSubagentTool,
  createToolsForAgent,
  MEMORY_TOOL_NAMES,
  type SubagentContext,
} from "./registries";
import type { AIConfig } from "./config";
import type { UIMessage, ChannelCapabilities, StreamEvent } from "./types";
import { logger } from "./logger";

/**
 * Build operator system instructions from channel capabilities and available tools.
 *
 * @internal
 * @param actionTools - Action tools available to this agent (name → Tool).
 * @param subagentTools - Subagent delegation tools (name → Tool, e.g. `coder`, `research`).
 * @param capabilities - Channel capabilities (rich text, max length, etc.).
 * @param memoryContext - Optional recalled memories to include in context.
 * @returns System instruction string for the operator.
 */
function buildOperatorInstructions(
  personality: string,
  actionTools: Record<string, Tool>,
  subagentTools: Record<string, Tool>,
  capabilities: ChannelCapabilities,
  memoryContext?: string
): string {
  const parts: string[] = [
    personality,
    "",
    `Current time: ${new Date().toISOString()}`,
    "",
  ];

  // Add channel capability information
  if (capabilities.supportsRichText) {
    parts.push("- You may use markdown formatting in your responses.");
  } else {
    parts.push("- Use plain text only, no formatting.");
  }

  if (capabilities.maxMessageLength > 0) {
    parts.push(
      `- Keep responses under ${capabilities.maxMessageLength} characters when possible.`
    );
  }

  parts.push("");

  // Add recalled memories if available
  if (memoryContext) {
    parts.push("# Relevant Memories");
    parts.push("");
    parts.push(memoryContext);
    parts.push("");
  }

  // Add action tools section with descriptions
  const actionToolNames = Object.keys(actionTools);
  if (actionToolNames.length > 0) {
    parts.push("# Tools");
    parts.push("You have access to tools:");
    for (const name of actionToolNames) {
      const desc = actionTools[name]?.description;
      parts.push(desc ? `- '${name}': ${desc}` : `- '${name}'`);
    }
    parts.push("");
  }

  // Add delegation instructions if subagents are available
  const subagentToolNames = Object.keys(subagentTools);
  if (subagentToolNames.length > 0) {
    parts.push("For specialized tasks, delegate to the appropriate tool:");
    for (const name of subagentToolNames) {
      const desc = subagentTools[name]?.description;
      parts.push(desc ? `- '${name}': ${desc}` : `- '${name}'`);
    }

    parts.push("");
    parts.push("Otherwise, handle the conversation directly.");
  }

  // Add memory usage instructions if memory tools are available
  const hasMemoryTools = MEMORY_TOOL_NAMES.some((name) => name in actionTools);
  if (hasMemoryTools) {
    parts.push("");
    parts.push("# Memory");
    parts.push("");
    parts.push("You have long-term memory. Use it like someone who actually pays attention.");
    parts.push("");
    parts.push("**Remember when it matters:**");
    parts.push("- Preferences, corrections, and standing orders — these aren't one-offs");
    parts.push("- Context that shapes future answers: job, stack, projects, constraints");
    parts.push("- Patterns and decisions, so you don't ask what they've already told you");
    parts.push("");
    parts.push("**Recall before you guess:**");
    parts.push("- Any whiff of past context: 'like before', 'that thing', 'remember when'");
    parts.push("- Questions where what you already know about them would change your answer");
    parts.push("- Call `recall` FIRST. Don't wing it from the current conversation alone.");
    parts.push("");
    parts.push("**Use memories, don't perform them:**");
    parts.push("- Let context shape your answer — don't narrate that you remembered.");
    parts.push("- If they ask something fresh, answer fresh. No recaps of past conversations.");
    parts.push("- Go deeper with what you know, don't repeat what they already know.");
    parts.push("");
    parts.push("**Categories for `remember`:**");
    parts.push("- `user_preference`: tone, tools, formats, workflow preferences");
    parts.push("- `knowledge`: projects, team, stack, constraints");
    parts.push("- `instruction`: standing orders — 'always X', 'never Y'");
    parts.push("");
    parts.push("**Tools:** `remember` (store), `recall` (search), `getMemory` (full detail by ID), `forget` (delete)");
  }

  return parts.join("\n");
}

/** Factory function type for creating subagent tools with context */
type SubagentToolFactory = (ctx: SubagentContext, toolCallId: string) => Tool;

/**
 * AI Agent using operator/subagent architecture.
 *
 * The operator model handles general chat and decides when to delegate to
 * specialized subagents (coder, research) via tools.
 */
export class Agent {
  private config: AIConfig;
  private personality: string;
  private actionTools: Record<string, Tool>;
  private subagentToolFactories: Record<string, SubagentToolFactory>;
  private subagentNames: Set<string>;
  /** Subagents that opted out of memory tools */
  private subagentsWithoutMemory: Set<string>;

  /** Use `Agent.create()` instead of constructing directly. */
  private constructor(config: AIConfig, personality: string) {
    this.config = config;
    this.personality = personality;
    this.actionTools = {};
    this.subagentToolFactories = {};
    this.subagentNames = new Set();
    this.subagentsWithoutMemory = new Set();
  }

  /**
   * Create and initialize an Agent, resolving async tool providers.
   *
   * @param config - AI config (gateway, agents, tools).
   * @param personality - Loaded personality content for the operator's system prompt.
   */
  static async create(config: AIConfig, personality: string): Promise<Agent> {
    const agent = new Agent(config, personality);

    // Resolve action tools from config (tools self-assign to agents via their `agents` field)
    agent.actionTools = createToolsForAgent("operator", config.tools ?? {});

    // Build subagent tool factories from registered definitions
    for (const definition of getSubagentDefinitions()) {
      // Check if this subagent is configured
      const agentConfig = config.agents[definition.configKey as keyof typeof config.agents];
      if (!agentConfig) {
        continue; // Subagent not enabled in config
      }

      // Get tools for this subagent (use custom getTools if provided, may be async)
      const subagentTools = definition.getTools
        ? await definition.getTools(config)
        : createToolsForAgent(definition.name, config.tools ?? {});

      // Filter out memory tools if subagent opts out
      let finalSubagentTools = subagentTools;
      if (definition.useMemory === false) {
        agent.subagentsWithoutMemory.add(definition.name);
        finalSubagentTools = Object.fromEntries(
          Object.entries(subagentTools).filter(
            ([name]) => !(MEMORY_TOOL_NAMES as readonly string[]).includes(name)
          )
        );
      }

      // Create the subagent and store its tool factory (not instantiated tool)
      const subagent = createSubagentFromDefinition(definition, config, finalSubagentTools);
      const toolFactory = createStreamingSubagentTool(definition, subagent, config);

      agent.subagentToolFactories[definition.name] = toolFactory;
      agent.subagentNames.add(definition.name);
    }

    return agent;
  }

  /**
   * Add tools to the action tools set.
   * Used to inject memory tools after agent creation.
   *
   * @param tools - Tools to add (merged with existing tools)
   */
  addActionTools(tools: Record<string, Tool>): void {
    this.actionTools = { ...this.actionTools, ...tools };
  }

  /**
   * Get the set of subagent names (for checking if a tool is a subagent).
   */
  getSubagentNames(): Set<string> {
    return this.subagentNames;
  }

  /**
   * Create request-scoped tools with the given SubagentContext.
   * Subagent tools are instantiated with the context, action tools are passed through.
   *
   * @param ctx - Subagent context with store, parent conversation, and event callback
   */
  createRequestTools(ctx: SubagentContext): Record<string, Tool> {
    const tools: Record<string, Tool> = { ...this.actionTools };

    // Create subagent tools with context
    // toolCallId is obtained from ToolExecutionOptions at execution time (parallel-safe)
    for (const [name, factory] of Object.entries(this.subagentToolFactories)) {
      tools[name] = {
        ...factory(ctx, ""),
        execute: async (input, options: ToolExecutionOptions) => {
          const boundTool = factory(ctx, options.toolCallId);
          return boundTool.execute!(input, options);
        },
      } as Tool;
    }

    return tools;
  }

  /**
   * Generate a response given conversation history and channel capabilities.
   * Creates a new operator agent instance per request with channel-specific instructions.
   *
   * @param history - Conversation history (UIMessage array with parts).
   * @param capabilities - Channel capabilities (formatting, max length).
   * @param subagentCtx - Optional subagent context for thread management.
   * @param memoryContext - Optional recalled memories to inject into system prompt.
   * @returns The assistant reply text.
   */
  async chat(
    history: UIMessage[],
    capabilities: ChannelCapabilities,
    subagentCtx?: SubagentContext,
    memoryContext?: string
  ): Promise<string> {
    // Delegate to chatStream and collect the full response
    const stream = this.chatStream(history, capabilities, undefined, subagentCtx, memoryContext);

    let fullText = "";
    while (true) {
      const { value, done } = await stream.next();
      if (done) {
        // The generator returns the full text when done
        fullText = value ?? fullText;
        break;
      }
      fullText += value;
    }

    return fullText;
  }

  /**
   * Stream a response token-by-token given conversation history and channel capabilities.
   * Yields text deltas as they arrive, returns the full collected text.
   *
   * @param history - Conversation history (UIMessage array with parts).
   * @param capabilities - Channel capabilities (formatting, max length).
   * @param onEvent - Optional callback for stream events (tool calls, sources, etc.).
   * @param subagentCtx - Optional subagent context for thread management.
   * @param memoryContext - Optional recalled memories to inject into system prompt.
   * @yields Text deltas as they stream in.
   * @returns The complete response text.
   */
  async *chatStream(
    history: UIMessage[],
    capabilities: ChannelCapabilities,
    onEvent?: (event: StreamEvent) => void,
    subagentCtx?: SubagentContext,
    memoryContext?: string
  ): AsyncGenerator<string, string> {
    const operatorConfig = this.config.agents.operator;
    const startTime = Date.now();
    let stepCount = 0;

    logger.agentStart("gateway", operatorConfig.model, history.length);

    // Create request-scoped tools if we have subagent context
    const tools = subagentCtx
      ? this.createRequestTools(subagentCtx)
      : { ...this.actionTools };

    // Build a dummy subagentTools object for instructions (just need names/descriptions)
    const subagentToolsForInstructions: Record<string, Tool> = {};
    for (const name of this.subagentNames) {
      const factory = this.subagentToolFactories[name];
      if (factory) {
        // Create a temporary tool just to get its description
        const tempTool = factory({ ...subagentCtx! } as SubagentContext, "");
        subagentToolsForInstructions[name] = tempTool;
      }
    }

    const instructions = buildOperatorInstructions(
      this.personality,
      this.actionTools,
      subagentToolsForInstructions,
      capabilities,
      memoryContext
    );

    const operator = new ToolLoopAgent({
      model: createModel(operatorConfig.model, this.config.gateway.apiKey),
      temperature: operatorConfig.temperature ?? 0,
      maxOutputTokens: operatorConfig.maxOutputTokens,
      stopWhen: stepCountIs(operatorConfig.maxSteps ?? 20),
      instructions,
      tools,
      onStepFinish: ({ toolCalls, toolResults, text, finishReason, usage }) => {
        stepCount++;

        // Logging only — events are emitted via fullStream below
        if (toolCalls && toolCalls.length > 0) {
          for (const call of toolCalls) {
            const matchingResult = toolResults?.find(
              (r) => r.toolCallId === call.toolCallId
            );
            logger.toolCall(call.toolName, {
              args: call.input,
              result: matchingResult?.output,
              agentName: "operator",
            });
          }
        }

        logger.stepFinish(
          "operator",
          stepCount,
          finishReason ?? "unknown",
          text,
          toolCalls?.length,
          usage
        );
      },
    });

    // Convert UIMessage format to AI SDK model messages
    const messages = await convertToModelMessages(history);

    logger.modelInstructions("operator", instructions);
    logger.modelInput("operator", messages);

    const result = await operator.stream({ messages });

    let fullText = "";
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          fullText += part.text;
          onEvent?.({ type: "text-delta", text: part.text });
          yield part.text;
          break;

        case "tool-call":
          onEvent?.({
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          });
          break;

        case "tool-result":
          // For subagent tools, extract threadId from result
          const isSubagent = this.subagentNames.has(part.toolName);
          const resultData = part.output as { text?: string; threadId?: string } | string;
          const threadId = isSubagent && typeof resultData === "object" ? resultData.threadId : undefined;

          onEvent?.({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: isSubagent && typeof resultData === "object" ? resultData.text : part.output,
            threadId,
          });
          break;

        case "source":
          // Handle both URL and document source types
          if (part.sourceType === "url") {
            onEvent?.({
              type: "source-url",
              sourceId: part.id,
              url: part.url,
              title: part.title,
            });
          } else if (part.sourceType === "document") {
            onEvent?.({
              type: "source-document",
              sourceId: part.id,
              mediaType: part.mediaType,
              title: part.title,
              filename: part.filename,
            });
          }
          break;

        case "reasoning-delta":
          onEvent?.({ type: "reasoning-delta", text: part.text });
          break;

        case "start-step":
          onEvent?.({ type: "step-start" });
          break;

        case "finish-step":
          onEvent?.({
            type: "step-finish",
            usage: part.usage,
            finishReason: part.finishReason,
          });
          break;

        case "file":
          // File is wrapped in a GeneratedFile object
          onEvent?.({
            type: "file",
            mediaType: part.file.mediaType,
            url: `data:${part.file.mediaType};base64,${part.file.base64}`,
          });
          break;
      }
    }

    logger.modelOutput("operator", fullText);

    const durationMs = Date.now() - startTime;
    logger.agentComplete(durationMs, stepCount);

    return fullText;
  }
}
