/**
 * Provider Registry - Factory for creating AI models via Vercel AI Gateway
 */

import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";

/**
 * Create a language model instance via the AI Gateway.
 *
 * @param model - Gateway model ID (e.g. `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`).
 * @param apiKey - AI Gateway API key.
 * @returns Language model instance for the AI SDK.
 */
export function createModel(model: string, apiKey: string): LanguageModel {
  const gateway = createGateway({ apiKey });
  return gateway(model);
}
