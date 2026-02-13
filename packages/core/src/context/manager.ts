/**
 * Context Manager - Tracks token usage, costs, and health for conversations.
 *
 * Uses:
 * - tiktoken (cl100k_base) for token counting - works offline, no API keys needed
 * - TokenLens v2 for model context limits and cost estimation
 *
 * TODO: Switch to "vercel" catalog once tokenlens releases support for it.
 * Currently using "models.dev" which requires stripping the provider prefix
 * from model IDs (e.g., "google/gemini-3-flash" -> "gemini-3-flash").
 */

import {
  createTokenlens,
  type Tokenlens,
  type TokenCosts,
} from "tokenlens";
import { get_encoding, type Tiktoken } from "tiktoken";
import type { UIMessage, TextUIPart, DynamicToolUIPart, ReasoningUIPart } from "../types";
import type {
  ContextConfig,
  ContextState,
  ContextHealth,
  ContextLimits,
  TokenUsage,
  ConversationStats,
} from "./types";
import { DEFAULT_CONTEXT_CONFIG, ZERO_COSTS } from "./types";

/**
 * Manages context window tracking, health checks, and cost accumulation.
 */
export class ContextManager {
  private tokenlens: Tokenlens;
  private config: ContextConfig;
  private encoder: Tiktoken;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };

    // TODO: Switch to "vercel" catalog once tokenlens releases support
    this.tokenlens = createTokenlens({ catalog: "models.dev" });
    // Use cl100k_base (GPT-4 tokenizer) for universal token estimates
    // Works offline without API keys, unlike tokenlens's native model tokenizers
    this.encoder = get_encoding("cl100k_base");
  }

  /**
   * Normalize model ID for catalog lookup.
   * Strips provider prefix (e.g., "google/gemini-3-flash" -> "gemini-3-flash")
   * since models.dev uses unprefixed model names.
   */
  private normalizeModelId(modelId: string): string {
    const slashIndex = modelId.indexOf("/");
    return slashIndex !== -1 ? modelId.slice(slashIndex + 1) : modelId;
  }

  /**
   * Get complete context state for an agent.
   * @param actualUsedTokens - If provided, uses this instead of tiktoken estimate.
   *   Should be the inputTokens from the last assistant message (accurate API count).
   */
  async getState(
    modelId: string,
    history: UIMessage[],
    accumulatedCosts: TokenCosts = ZERO_COSTS,
    actualUsedTokens?: number
  ): Promise<ContextState> {
    const limits = await this.getLimits(modelId);
    // Use actual API token count if available, otherwise estimate with tiktoken
    const usedTokens = actualUsedTokens ?? await this.countHistoryTokens(modelId, history);
    const health = this.computeHealth(limits, usedTokens);

    return {
      modelId,
      limits,
      health,
      costs: accumulatedCosts,
    };
  }

  /**
   * Get model context limits.
   * @throws Error if model is not found in the catalog
   */
  async getLimits(modelId: string): Promise<ContextLimits> {
    const normalizedId = this.normalizeModelId(modelId);
    const limits = await this.tokenlens.getContextLimits({ modelId: normalizedId });
    if (!limits) {
      throw new Error(`Model "${modelId}" not found in catalog`);
    }
    return {
      input: limits.context ?? limits.input ?? 0,
      output: limits.output ?? 0,
      total: limits.context ?? limits.input ?? 0,
    };
  }

  /**
   * Count tokens in conversation history.
   * Uses tiktoken (cl100k_base) for universal estimates across all models.
   */
  async countHistoryTokens(modelId: string, history: UIMessage[]): Promise<number> {
    const text = this.serializeHistory(history);
    if (!text) return 0;
    return this.encoder.encode(text).length;
  }

  /**
   * Compute health status from limits and usage.
   */
  computeHealth(limits: ContextLimits, usedTokens: number): ContextHealth {
    const effectiveMax = limits.input - this.config.reserveForOutput;
    const remainingTokens = Math.max(0, effectiveMax - usedTokens);
    const percentUsed = effectiveMax > 0 ? (usedTokens / effectiveMax) * 100 : 0;
    const shouldCompact = percentUsed >= this.config.compactionThreshold * 100;

    const targetTokens = effectiveMax * this.config.targetAfterCompaction;
    const tokensToRemove = shouldCompact ? Math.max(0, usedTokens - targetTokens) : 0;

    return {
      usedTokens,
      remainingTokens,
      percentUsed: Math.min(100, percentUsed),
      isHealthy: percentUsed < this.config.compactionThreshold * 100,
      shouldCompact,
      tokensToRemove: Math.ceil(tokensToRemove),
    };
  }

  /**
   * Compute costs from usage data.
   * @throws Error if cost computation fails for the model
   */
  async computeCostsFromUsage(
    modelId: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      reasoningTokens: number;
    }
  ): Promise<TokenCosts> {
    const normalizedId = this.normalizeModelId(modelId);
    return await this.tokenlens.computeCostUSD({
      modelId: normalizedId,
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        reasoning_tokens: usage.reasoningTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_write_tokens: usage.cacheWriteTokens,
      },
    });
  }

  /**
   * Update state after a turn completes.
   */
  async updateAfterTurn(state: ContextState, usage: TokenUsage): Promise<ContextState> {
    const normalizedId = this.normalizeModelId(state.modelId);
    const turnCosts = await this.tokenlens.computeCostUSD({
      modelId: normalizedId,
      usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
    });

    return {
      ...state,
      costs: {
        inputTokenCostUSD: state.costs.inputTokenCostUSD + turnCosts.inputTokenCostUSD,
        outputTokenCostUSD: state.costs.outputTokenCostUSD + turnCosts.outputTokenCostUSD,
        reasoningTokenCostUSD: (state.costs.reasoningTokenCostUSD ?? 0) + (turnCosts.reasoningTokenCostUSD ?? 0),
        cacheReadTokenCostUSD: (state.costs.cacheReadTokenCostUSD ?? 0) + (turnCosts.cacheReadTokenCostUSD ?? 0),
        cacheWriteTokenCostUSD: (state.costs.cacheWriteTokenCostUSD ?? 0) + (turnCosts.cacheWriteTokenCostUSD ?? 0),
        totalTokenCostUSD: state.costs.totalTokenCostUSD + turnCosts.totalTokenCostUSD,
        ratesUsed: state.costs.ratesUsed,
      },
      lastTurn: usage,
    };
  }

  /**
   * Aggregate stats across operator and subagents.
   */
  aggregateStats(
    operator: ContextState,
    subagents: Record<string, ContextState>
  ): ConversationStats {
    let totalCostUSD = operator.costs.totalTokenCostUSD;
    let totalInputTokens = operator.lastTurn?.inputTokens ?? 0;
    let totalOutputTokens = operator.lastTurn?.outputTokens ?? 0;

    for (const state of Object.values(subagents)) {
      totalCostUSD += state.costs.totalTokenCostUSD;
      totalInputTokens += state.lastTurn?.inputTokens ?? 0;
      totalOutputTokens += state.lastTurn?.outputTokens ?? 0;
    }

    return {
      operator,
      subagents,
      totalCostUSD,
      totalInputTokens,
      totalOutputTokens,
    };
  }

  /**
   * Serialize history to text for token counting.
   */
  private serializeHistory(history: UIMessage[]): string {
    return history
      .map((msg) => {
        const texts: string[] = [];
        for (const part of msg.parts ?? []) {
          switch (part.type) {
            case "text":
              texts.push((part as TextUIPart).text);
              break;
            case "dynamic-tool": {
              const tool = part as DynamicToolUIPart;
              texts.push(`[Tool: ${tool.toolName}]`);
              if (tool.input) texts.push(JSON.stringify(tool.input));
              if (tool.output) texts.push(JSON.stringify(tool.output));
              break;
            }
            case "reasoning":
              texts.push((part as ReasoningUIPart).text);
              break;
          }
        }
        return `${msg.role}: ${texts.join("\n")}`;
      })
      .join("\n\n");
  }
}
