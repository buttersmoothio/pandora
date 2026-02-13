/**
 * Context Management Types
 *
 * Tracks token usage, costs, and context health for conversations.
 * Reuses types from tokenlens where possible.
 */

import type { TokenCosts } from "tokenlens";

// Re-export TokenCosts from tokenlens for convenience
export type { TokenCosts };

// ============================================================================
// Token Usage
// ============================================================================

/** Token usage from a single turn/step */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens: number;
}

// ============================================================================
// Cost Tracking
// ============================================================================

/** Zero costs constant (tokenlens TokenCosts format) */
export const ZERO_COSTS: TokenCosts = {
  inputTokenCostUSD: 0,
  outputTokenCostUSD: 0,
  reasoningTokenCostUSD: 0,
  cacheReadTokenCostUSD: 0,
  cacheWriteTokenCostUSD: 0,
  totalTokenCostUSD: 0,
  ratesUsed: {},
};

// ============================================================================
// Context Health
// ============================================================================

/** Context window health status */
export interface ContextHealth {
  /** Tokens currently in context */
  usedTokens: number;
  /** Tokens available for new input */
  remainingTokens: number;
  /** Usage as percentage (0-100) */
  percentUsed: number;
  /** Context is within safe limits */
  isHealthy: boolean;
  /** Compaction recommended */
  shouldCompact: boolean;
  /** Tokens to remove if compacting */
  tokensToRemove: number;
}

// ============================================================================
// Model Limits
// ============================================================================

/** Model context limits */
export interface ContextLimits {
  /** Max input tokens */
  input: number;
  /** Max output tokens */
  output: number;
  /** Max total context (input + output) */
  total: number;
}

// ============================================================================
// Context State (Full Snapshot)
// ============================================================================

/** Complete context state for an agent */
export interface ContextState {
  /** Model identifier (e.g., "anthropic/claude-sonnet-4.5") */
  modelId: string;
  /** Context limits */
  limits: ContextLimits;
  /** Current health status */
  health: ContextHealth;
  /** Accumulated costs */
  costs: TokenCosts;
  /** Usage from last completed turn */
  lastTurn?: TokenUsage;
}

// ============================================================================
// Conversation Stats (Aggregated)
// ============================================================================

/** Aggregated stats across operator + subagents */
export interface ConversationStats {
  /** Operator context state */
  operator: ContextState;
  /** Subagent states by threadId */
  subagents: Record<string, ContextState>;
  /** Total cost across all agents */
  totalCostUSD: number;
  /** Total input tokens (last turn, all agents) */
  totalInputTokens: number;
  /** Total output tokens (last turn, all agents) */
  totalOutputTokens: number;
}

// ============================================================================
// Stream Events
// ============================================================================

/** Context state update event */
export interface ContextStateEvent {
  type: "context-state";
  conversationId: string;
  /** Thread ID if subagent, undefined for operator */
  threadId?: string;
  state: ContextState;
}

/** Compaction occurred event */
export interface CompactionEvent {
  type: "compaction";
  conversationId: string;
  /** Tokens before compaction */
  beforeTokens: number;
  /** Tokens after compaction */
  afterTokens: number;
  /** Tokens removed */
  removed: number;
  /** Episode ID if summary was stored */
  episodeId?: string;
}

/** Conversation stats event (emitted after turn completes) */
export interface ConversationStatsEvent {
  type: "conversation-stats";
  conversationId: string;
  stats: ConversationStats;
}

// ============================================================================
// Configuration
// ============================================================================

/** Context manager configuration */
export interface ContextConfig {
  /** Compaction threshold (0-1, default: 0.75) */
  compactionThreshold: number;
  /** Target usage after compaction (0-1, default: 0.5) */
  targetAfterCompaction: number;
  /** Tokens to reserve for output (default: 4096) */
  reserveForOutput: number;
}

/** Default configuration */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  compactionThreshold: 0.75,
  targetAfterCompaction: 0.5,
  reserveForOutput: 4096,
};
