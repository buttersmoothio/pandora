import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { Memory } from '@mastra/memory'
import { type Config, DEFAULT_WORKING_MEMORY_TEMPLATE } from './config'
import { getLogger } from './logger'
import type { VectorResult } from './vector'

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
  const wm = options?.config?.memory?.workingMemory
  const log = getLogger()
  log.debug('Memory initializing', {
    semanticRecall: sr?.enabled ?? false,
    embedder: sr?.enabled ? sr?.embedder : undefined,
    workingMemory: wm?.enabled ?? false,
  })

  return new Memory({
    vector: sr?.enabled && options?.vector ? options.vector.vector : false,
    embedder:
      sr?.enabled && sr?.embedder
        ? new ModelRouterEmbeddingModel({
            providerId: sr.embedder.slice(0, sr.embedder.indexOf('/')),
            modelId: sr.embedder.slice(sr.embedder.indexOf('/') + 1),
          })
        : undefined,
    options: {
      lastMessages: 20,
      generateTitle: true,
      semanticRecall: sr?.enabled ?? false, // Uses Mastra defaults (topK: 4, messageRange: {before:1, after:1})
      workingMemory: wm?.enabled
        ? { enabled: true, template: DEFAULT_WORKING_MEMORY_TEMPLATE }
        : undefined,
    },
  })
}
