/**
 * Provider Registry - Factory for creating AI models from different providers
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMinimax } from "vercel-minimax-ai-provider";
import type { LanguageModel } from "ai";

export type ProviderName = "openai" | "anthropic" | "minimax";

/**
 * Create a language model instance for the given provider and model.
 *
 * @param provider - Provider name (`openai`, `anthropic`, `minimax`).
 * @param model - Model ID (e.g. `gpt-4o`, `claude-sonnet-4-20250514`, `MiniMax-M2`).
 * @param apiKey - Provider API key.
 * @returns Language model instance for the AI SDK.
 */
export function createModel(
  provider: ProviderName,
  model: string,
  apiKey: string
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "minimax":
      return createMinimax({ apiKey })(model);
  }
}
