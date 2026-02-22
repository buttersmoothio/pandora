import { Memory } from '@mastra/memory'

/**
 * Create a Memory instance configured from Pandora config.
 *
 * Uses Mastra's storage by default (no explicit storage needed).
 * Title generation uses the agent's model automatically.
 */
export function createMemory() {
  return new Memory({
    options: {
      lastMessages: 20,
      generateTitle: true,
    },
  })
}
