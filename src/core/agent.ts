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
 * @param actionToolNames - Names of action tools available to this agent.
 * @param subagentToolNames - Names of subagent delegation tools (e.g. `["coder", "research"]`).
 * @param capabilities - Channel capabilities (rich text, max length, etc.).
 * @returns System instruction string for the operator.
 */
function buildOperatorInstructions(
  actionToolNames: string[],
  subagentToolNames: string[],
  capabilities: ChannelCapabilities
): string {
  const parts: string[] = [
    "You are a helpful AI assistant.",
    "",
  ];

  // Add channel capability information
  if (capabilities.supportsRichText) {
    parts.push("- You can use simple HTML formatting in your responses:");
    parts.push("  - <b>bold</b> for bold text");
    parts.push("  - <i>italic</i> for italic text");
    parts.push("  - <code>code</code> for inline code");
    parts.push("  - <pre>code block</pre> for code blocks");
    parts.push("  - <a href=\"URL\">link text</a> for links");
    parts.push("  - Do NOT use markdown syntax like **bold** or *italic*.");
  } else {
    parts.push("- Use plain text only, no formatting.");
  }

  if (capabilities.maxMessageLength > 0) {
    parts.push(
      `- Keep responses under ${capabilities.maxMessageLength} characters when possible.`
    );
  }

  parts.push("");

  // Add action tools section
  if (actionToolNames.length > 0) {
    parts.push("You have access to tools:");
    for (const toolName of actionToolNames) {
      parts.push(`- Use '${toolName}' tool when appropriate`);
    }
    parts.push("");
  }

  // Add delegation instructions if subagents are available
  if (subagentToolNames.length > 0) {
    parts.push("For specialized tasks, delegate to the appropriate tool:");

    if (subagentToolNames.includes("coder")) {
      parts.push("- Use 'coder' for programming tasks, debugging, code review");
    }
    if (subagentToolNames.includes("research")) {
      parts.push("- Use 'research' for information gathering, fact-checking");
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
  private actionToolNames: string[];
  private subagentToolNames: string[];

  /**
   * @param config - AI config (providers, operator, optional subagents, tools).
   */
  constructor(config: AIConfig) {
    this.config = config;
    this.tools = {};
    this.actionToolNames = [];
    this.subagentToolNames = [];

    // Resolve action tools from config (tools self-assign to agents via their `agents` field)
    const operatorTools = createToolsForAgent(
      "operator",
      config.tools ?? {}
    );
    this.actionToolNames = Object.keys(operatorTools);

    // Build subagent delegation tools and pass action tools to them
    if (config.agents.coder) {
      const coderTools = createToolsForAgent(
        "coder",
        config.tools ?? {}
      );
      const coderSubagent = createCoderSubagent(config, coderTools);
      this.tools.coder = createCoderTool(coderSubagent, config);
      this.subagentToolNames.push("coder");
    }

    if (config.agents.research) {
      const researchTools = createToolsForAgent(
        "research",
        config.tools ?? {}
      );
      const researchSubagent = createResearchSubagent(config, researchTools);
      this.tools.research = createResearchTool(researchSubagent, config);
      this.subagentToolNames.push("research");
    }

    // Merge action tools into the operator's tool set
    this.tools = { ...operatorTools, ...this.tools };
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
      this.actionToolNames,
      this.subagentToolNames,
      capabilities
    );

    // Create operator agent with configured model
    const operator = new ToolLoopAgent({
      model: createModel(
        operatorConfig.provider,
        operatorConfig.model,
        providerConfig.apiKey
      ),
      instructions,
      tools: this.tools,
      onStepFinish: ({ toolCalls }) => {
        stepCount++;
        if (toolCalls && toolCalls.length > 0) {
          for (const call of toolCalls) {
            logger.toolCall(call.toolName);
          }
        }
      },
    });

    // Convert our ChatMessage format to AI SDK format
    const messages = history.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    const result = await operator.generate({ messages });

    const durationMs = Date.now() - startTime;
    logger.agentComplete(durationMs, stepCount);

    return result.text;
  }
}
