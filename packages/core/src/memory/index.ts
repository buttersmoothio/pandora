import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { Memory } from '@mastra/memory'
import type { Config } from '../config'
import type { VectorResult } from '../vector'

export interface CreateMemoryOptions {
  config: Config
  vector?: VectorResult | null
}

/**
 * Create a Memory instance configured from Pandora config.
 *
 * Uses Mastra's storage by default (no explicit storage needed).
 * Title generation uses the agent's model automatically.
 * When semantic recall is enabled and a vector store is provided,
 * enables RAG-based recall using Mastra defaults (topK: 4, messageRange: {before:1, after:1}).
 */
export function createMemory(options?: CreateMemoryOptions) {
  const sr = options?.config?.memory?.semanticRecall

  return new Memory({
    vector: sr?.enabled && options?.vector ? options.vector.vector : false,
    embedder: sr?.embedder
      ? new ModelRouterEmbeddingModel({
          providerId: sr.embedder.slice(0, sr.embedder.indexOf('/')),
          modelId: sr.embedder.slice(sr.embedder.indexOf('/') + 1),
        })
      : undefined,
    options: {
      lastMessages: 20,
      generateTitle: true,
      semanticRecall: sr?.enabled ?? false, // Uses Mastra defaults (topK: 4, messageRange: {before:1, after:1})
    },
  })
}
