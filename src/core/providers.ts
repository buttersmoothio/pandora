/**
 * Provider Registry - Factory for creating AI models from different providers
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMinimax } from "vercel-minimax-ai-provider";
import type { LanguageModel } from "ai";

export type ProviderName = "openai" | "anthropic" | "minimax";

/**
 * Create a language model instance from the specified provider
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
