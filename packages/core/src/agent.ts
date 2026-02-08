/**
 * AI Agent - Operator with Subagent Architecture
 *
 * The main operator agent handles general conversation and delegates
 * specialized tasks to subagents (coding, research, etc.) via tools.
 */

import { ToolLoopAgent, stepCountIs, type Tool, type ToolChoice } from "ai";
import { createModel } from "./providers";
import {
  getSubagentDefinitions,
  createSubagentFromDefinition,
  createSubagentTool,
  createToolsForAgent,
} from "./registries";
import type { AIConfig } from "./config";
import type { ChatMessage, ChannelCapabilities, StreamEvent } from "./types";
import { logger } from "./logger";

/**
 * Build operator system instructions from channel capabilities and available tools.
 *
 * @internal
 * @param actionTools - Action tools available to this agent (name → Tool).
 * @param subagentTools - Subagent delegation tools (name → Tool, e.g. `coder`, `research`).
 * @param capabilities - Channel capabilities (rich text, max length, etc.).
 * @returns System instruction string for the operator.
 */
function buildOperatorInstructions(
  actionTools: Record<string, Tool>,
  subagentTools: Record<string, Tool>,
  capabilities: ChannelCapabilities
): string {
  const parts: string[] = [
    "You are a helpful AI assistant.",
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

  // Add action tools section with descriptions
  const actionToolNames = Object.keys(actionTools);
  if (actionToolNames.length > 0) {
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

  parts.push("");
  parts.push("Be concise and helpful.");

  return parts.join("\n");
}

/**
 * AI Agent using operator/subagent architecture.
 *
 * The operator model handles general chat and decides when to delegate to
 * specialized subagents (coder, research) via tools.
 */
export class Agent {
  private config: AIConfig;
  private tools: Record<string, Tool>;
  private actionTools: Record<string, Tool>;
  private subagentTools: Record<string, Tool>;

  /** Use `Agent.create()` instead of constructing directly. */
  private constructor(config: AIConfig) {
    this.config = config;
    this.tools = {};
    this.actionTools = {};
    this.subagentTools = {};
  }

  /**
   * Create and initialize an Agent, resolving async tool providers.
   *
   * @param config - AI config (gateway, agents, tools).
   */
  static async create(config: AIConfig): Promise<Agent> {
    const agent = new Agent(config);

    // Resolve action tools from config (tools self-assign to agents via their `agents` field)
    agent.actionTools = createToolsForAgent("operator", config.tools ?? {});

    // Build subagent delegation tools from registered definitions
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

      // Create the subagent and its delegation tool
      const subagent = createSubagentFromDefinition(definition, config, subagentTools);
      const delegationTool = createSubagentTool(definition, subagent, config);

      agent.subagentTools[definition.name] = delegationTool;
    }

    // Merge action tools and subagent tools into the operator's full tool set
    agent.tools = { ...agent.actionTools, ...agent.subagentTools };
    return agent;
  }

  /**
   * Generate a response given conversation history and channel capabilities.
   * Creates a new operator agent instance per request with channel-specific instructions.
   *
   * @param history - Conversation history (user/assistant/system messages).
   * @param capabilities - Channel capabilities (formatting, max length).
   * @returns The assistant reply text.
   */
  async chat(
    history: ChatMessage[],
    capabilities: ChannelCapabilities
  ): Promise<string> {
    const operatorConfig = this.config.agents.operator;
    const startTime = Date.now();
    let stepCount = 0;

    logger.agentStart("gateway", operatorConfig.model, history.length);

    // Build instructions that include channel capabilities and available tools
    const instructions = buildOperatorInstructions(
      this.actionTools,
      this.subagentTools,
      capabilities
    );

    // Create operator agent with configured model
    const operator = new ToolLoopAgent({
      model: createModel(operatorConfig.model, this.config.gateway.apiKey),
      temperature: operatorConfig.temperature ?? 0,
      maxOutputTokens: operatorConfig.maxOutputTokens,
      stopWhen: stepCountIs(operatorConfig.maxSteps ?? 20),
      toolChoice: operatorConfig.toolChoice as ToolChoice<any> | undefined,
      instructions,
      tools: this.tools,
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

    // Convert our ChatMessage format to AI SDK format
    const messages = history.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    // Log full model input when verbose
    logger.modelInstructions("operator", instructions);
    logger.modelInput("operator", messages);

    const result = await operator.generate({ messages });

    // Log full model output when verbose
    logger.modelOutput("operator", result.text);

    const durationMs = Date.now() - startTime;
    logger.agentComplete(durationMs, stepCount);

    return result.text;
  }

  /**
   * Stream a response token-by-token given conversation history and channel capabilities.
   * Yields text deltas as they arrive, returns the full collected text.
   *
   * @param history - Conversation history (user/assistant/system messages).
   * @param capabilities - Channel capabilities (formatting, max length).
   * @param onEvent - Optional callback for stream events (tool calls, etc.).
   * @yields Text deltas as they stream in.
   * @returns The complete response text.
   */
  async *chatStream(
    history: ChatMessage[],
    capabilities: ChannelCapabilities,
    onEvent?: (event: StreamEvent) => void
  ): AsyncGenerator<string, string> {
    const operatorConfig = this.config.agents.operator;
    const startTime = Date.now();
    let stepCount = 0;

    logger.agentStart("gateway", operatorConfig.model, history.length);

    const instructions = buildOperatorInstructions(
      this.actionTools,
      this.subagentTools,
      capabilities
    );

    const operator = new ToolLoopAgent({
      model: createModel(operatorConfig.model, this.config.gateway.apiKey),
      temperature: operatorConfig.temperature ?? 0,
      maxOutputTokens: operatorConfig.maxOutputTokens,
      stopWhen: stepCountIs(operatorConfig.maxSteps ?? 20),
      toolChoice: operatorConfig.toolChoice as ToolChoice<any> | undefined,
      instructions,
      tools: this.tools,
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

    const messages = history.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    logger.modelInstructions("operator", instructions);
    logger.modelInput("operator", messages);

    const result = await operator.stream({ messages });

    let fullText = "";
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          fullText += part.text;
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
          onEvent?.({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          });
          break;
        case "source":
          if (part.sourceType === "url") {
            onEvent?.({
              type: "source",
              sourceType: part.sourceType,
              id: part.id,
              url: part.url,
              title: part.title,
            });
          }
          break;
        case "reasoning-delta":
          onEvent?.({ type: "reasoning-delta", text: part.text });
          break;
        case "finish-step":
          onEvent?.({
            type: "step-finish",
            usage: part.usage,
            finishReason: part.finishReason,
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
