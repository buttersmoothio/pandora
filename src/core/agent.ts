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
import type { AIConfig } from "./config";
import type { ChatMessage, ChannelCapabilities } from "./types";
import { logger } from "./logger";

/**
 * Build operator instructions based on available subagents
 */
function buildOperatorInstructions(
  availableTools: string[],
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

  // Add delegation instructions if subagents are available
  if (availableTools.length > 0) {
    parts.push("For specialized tasks, delegate to the appropriate tool:");
    
    if (availableTools.includes("coder")) {
      parts.push("- Use 'coder' for programming tasks, debugging, code review");
    }
    if (availableTools.includes("research")) {
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
 * AI Agent using operator/subagent architecture
 *
 * The operator model (MiniMax by default) handles general chat and decides
 * when to delegate to specialized subagents.
 */
export class Agent {
  private config: AIConfig;
  private tools: Record<string, Tool>;
  private availableToolNames: string[];

  constructor(config: AIConfig) {
    this.config = config;
    this.tools = {};
    this.availableToolNames = [];

    // Build tools from configured subagents
    if (config.agents.coder) {
      const coderSubagent = createCoderSubagent(config);
      this.tools.coder = createCoderTool(coderSubagent, config);
      this.availableToolNames.push("coder");
    }

    if (config.agents.research) {
      const researchSubagent = createResearchSubagent(config);
      this.tools.research = createResearchTool(researchSubagent, config);
      this.availableToolNames.push("research");
    }
  }

  /**
   * Generate a response given conversation history and channel capabilities.
   * Creates a new operator agent instance per request to include channel-specific instructions.
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
      this.availableToolNames,
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
