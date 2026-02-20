import { Memory } from '@mastra/memory'
import type { Config } from '../config'
import { resolveModel } from '../mastra/models'

/**
 * Create a Memory instance configured from Pandora config.
 *
 * Uses Mastra's storage by default (no explicit storage needed).
 * Title generation uses the operator model.
 */
export function createMemory(config: Config) {
  return new Memory({
    options: {
      lastMessages: 20,
      generateTitle: {
        model: resolveModel(config, 'operator'),
      },
    },
  })
}
