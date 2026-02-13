/**
 * Compaction Manager - Summarizes older messages to free context space.
 *
 * When context approaches limits, this compacts older messages into a summary,
 * preserving conversation continuity while reducing token usage.
 */

import { generateText, type LanguageModel } from "ai";
import type { UIMessage, TextUIPart } from "../types";
import type { ContextManager } from "./manager";
import type { ContextHealth, TokenUsage } from "./types";
import { logger } from "../logger";

/** Result of a compaction operation */
export interface CompactionResult {
  /** Compacted history to use */
  history: UIMessage[];
  /** Summary text for episode storage */
  summary: string;
  /** Number of messages removed */
  removedCount: number;
  /** Tokens before compaction */
  beforeTokens: number;
  /** Tokens after compaction */
  afterTokens: number;
}

/** Configuration for compaction */
export interface CompactionConfig {
  /** Minimum messages to keep uncompacted (default: 4) */
  keepRecentMessages: number;
  /** Minimum messages needed before compaction is allowed (default: 6) */
  minMessagesForCompaction: number;
}

const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  keepRecentMessages: 4,
  minMessagesForCompaction: 6,
};

const SUMMARIZATION_PROMPT = `Summarize this conversation segment concisely. Preserve:
- Key decisions and conclusions reached
- Important facts, names, and specific details mentioned
- User preferences and requirements expressed
- Action items, commitments, or next steps
- Technical details that may be referenced later

Be factual and specific. Do not add interpretation or commentary.

Conversation:
`;

/**
 * Manages conversation compaction via summarization.
 */
export class CompactionManager {
  private contextManager: ContextManager;
  private config: CompactionConfig;

  constructor(
    contextManager: ContextManager,
    config: Partial<CompactionConfig> = {}
  ) {
    this.contextManager = contextManager;
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /**
   * Check if compaction should occur and perform it if needed.
   *
   * @param history - Current conversation history
   * @param health - Current context health
   * @param model - LLM to use for summarization
   * @returns Compaction result if compaction occurred, null otherwise
   */
  async compactIfNeeded(
    history: UIMessage[],
    health: ContextHealth,
    model: LanguageModel
  ): Promise<CompactionResult | null> {
    // Don't compact if not needed
    if (!health.shouldCompact) {
      return null;
    }

    // Don't compact if not enough messages
    if (history.length < this.config.minMessagesForCompaction) {
      logger.debug(
        "Compaction",
        `Skipping: only ${history.length} messages (min: ${this.config.minMessagesForCompaction})`
      );
      return null;
    }

    return this.compact(history, health, model);
  }

  /**
   * Perform compaction on the history.
   */
  async compact(
    history: UIMessage[],
    health: ContextHealth,
    model: LanguageModel
  ): Promise<CompactionResult> {
    const beforeTokens = health.usedTokens;

    // Split: older messages to summarize, recent to keep
    const keepCount = Math.min(this.config.keepRecentMessages, history.length - 2);
    const splitPoint = Math.max(0, history.length - keepCount);

    const toSummarize = history.slice(0, splitPoint);
    const toKeep = history.slice(splitPoint);

    logger.info("Compaction", `Summarizing ${toSummarize.length} messages, keeping ${toKeep.length}`);

    // Generate summary
    const summary = await this.summarize(toSummarize, model);

    // Create synthetic summary message
    const summaryMessage: UIMessage = {
      id: `summary-${Date.now()}`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `[Previous conversation summary - ${toSummarize.length} messages]\n\n${summary}`,
          state: "done",
        } as TextUIPart,
      ],
    };

    const compactedHistory = [summaryMessage, ...toKeep];

    // Count new token usage
    // Note: We need the modelId but it's not in health, so we estimate
    const afterTokens = await this.estimateTokens(compactedHistory);

    logger.info("Compaction", `Reduced from ${beforeTokens} to ~${afterTokens} tokens`);

    return {
      history: compactedHistory,
      summary,
      removedCount: toSummarize.length,
      beforeTokens,
      afterTokens,
    };
  }

  /**
   * Generate a summary of messages using the LLM.
   */
  private async summarize(messages: UIMessage[], model: LanguageModel): Promise<string> {
    const conversationText = this.formatMessagesForSummary(messages);

    try {
      const result = await generateText({
        model,
        prompt: SUMMARIZATION_PROMPT + conversationText,
        maxOutputTokens: 1024,
        temperature: 0,
      });

      return result.text.trim();
    } catch (err) {
      logger.error("Compaction", "Summarization failed", err);
      // Fallback: create a basic summary from message snippets
      return this.createFallbackSummary(messages);
    }
  }

  /**
   * Format messages for the summarization prompt.
   */
  private formatMessagesForSummary(messages: UIMessage[]): string {
    return messages
      .map((msg) => {
        const textParts = (msg.parts ?? [])
          .filter((p) => p.type === "text")
          .map((p) => (p as TextUIPart).text)
          .join("\n");
        return `${msg.role === "user" ? "User" : "Assistant"}: ${textParts}`;
      })
      .join("\n\n");
  }

  /**
   * Create a basic summary without LLM (fallback).
   */
  private createFallbackSummary(messages: UIMessage[]): string {
    const snippets: string[] = [];

    for (const msg of messages) {
      const textParts = (msg.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as TextUIPart).text)
        .join(" ");

      if (textParts) {
        const truncated = textParts.length > 100
          ? textParts.slice(0, 100) + "..."
          : textParts;
        snippets.push(`${msg.role}: ${truncated}`);
      }
    }

    return snippets.join("\n");
  }

  /**
   * Estimate token count for history (rough estimate without model ID).
   */
  private async estimateTokens(history: UIMessage[]): Promise<number> {
    let charCount = 0;
    for (const msg of history) {
      for (const part of msg.parts ?? []) {
        if (part.type === "text") {
          charCount += (part as TextUIPart).text.length;
        }
      }
    }
    // Rough estimate: 4 characters per token
    return Math.ceil(charCount / 4);
  }
}
