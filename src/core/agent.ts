/**
 * AI Agent - Operator with Subagent Architecture
 *
 * The main operator agent handles general conversation and delegates
 * specialized tasks to subagents (coding, research, etc.) via tools.
 */

import { ToolLoopAgent, type Tool } from "ai";
import { createModel } from "./providers";
import {
  createCoderSubagent,
  createCoderTool,
  createResearchSubagent,
  createResearchTool,
} from "./subagents";
import { createToolsForAgent } from "../tools";
import type { AIConfig } from "./config";
import type { ChatMessage, ChannelCapabilities } from "./types";
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

  /**
   * @param config - AI config (providers, operator, optional subagents, tools).
   */
  constructor(config: AIConfig) {
    this.config = config;
    this.tools = {};
    this.actionTools = {};
    this.subagentTools = {};

    // Resolve action tools from config (tools self-assign to agents via their `agents` field)
    this.actionTools = createToolsForAgent(
      "operator",
      config.tools ?? {}
    );

    // Build subagent delegation tools and pass action tools to them
    if (config.agents.coder) {
      const coderTools = createToolsForAgent(
        "coder",
        config.tools ?? {}
      );
      const coderSubagent = createCoderSubagent(config, coderTools);
      this.subagentTools.coder = createCoderTool(coderSubagent, config);
    }

    if (config.agents.research) {
      const researchTools = createToolsForAgent(
        "research",
        config.tools ?? {}
      );
      const researchSubagent = createResearchSubagent(config, researchTools);
      this.subagentTools.research = createResearchTool(researchSubagent, config);
    }

    // Merge action tools and subagent tools into the operator's full tool set
    this.tools = { ...this.actionTools, ...this.subagentTools };
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
    const providerConfig = this.config.providers[operatorConfig.provider]!;
    const startTime = Date.now();
    let stepCount = 0;

    logger.agentStart(operatorConfig.provider, operatorConfig.model, history.length);

    // Build instructions that include channel capabilities and available tools
    const instructions = buildOperatorInstructions(
      this.actionTools,
      this.subagentTools,
      capabilities
    );

    // Create operator agent with configured model
    const operator = new ToolLoopAgent({
      model: createModel(
        operatorConfig.provider,
        operatorConfig.model,
        providerConfig.apiKey
      ),
      temperature: 0,
      instructions,
      tools: this.tools,
      onStepFinish: ({ toolCalls, toolResults, text, finishReason, usage }) => {
        stepCount++;

        // Log each tool call with full args and results when verbose
        if (toolCalls && toolCalls.length > 0) {
          for (const call of toolCalls) {
            // Find the matching result for this tool call
            const matchingResult = toolResults?.find(
              (r: { toolCallId: string }) => r.toolCallId === call.toolCallId
            );

            logger.toolCall(call.toolName, {
              args: (call as Record<string, unknown>).input ?? (call as Record<string, unknown>).args,
              result: (matchingResult as Record<string, unknown> | undefined)?.output ?? (matchingResult as Record<string, unknown> | undefined)?.result,
              agentName: "operator",
            });
          }
        }

        // Log step-level details (intermediate text, finish reason, token usage)
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
}
