import { Mastra } from '@mastra/core'
import { createOperator } from '../agents/operator'
import { getConfig } from '../config'
import { isServerless } from '../env'
import { getLogger } from '../logger'
import { createMemory } from '../memory'
import { getStorage } from '../storage'
import { loadTools } from '../tools'

/** Cached Mastra instance for server mode */
let _cached: Mastra | null = null

/**
 * Get a configured Mastra instance.
 *
 * In server mode, caches the instance for the process lifetime.
 * In serverless mode, creates a fresh instance per invocation.
 *
 * Flow: getStorage() → getConfig() → loadTools() → createMemory() → createOperator() → new Mastra(...)
 */
export async function getMastra(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<Mastra> {
  if (!isServerless() && _cached) {
    return _cached
  }

  // 1. Storage
  const { mastra: mastraStorage, config: configStore } = await getStorage(env, bindings)

  // 2. Config
  const config = await getConfig(configStore)

  // 3. Tools
  const tools = await loadTools(config, env)

  // 4. Memory
  const memory = createMemory(config)

  // 5. Operator agent (with memory)
  const operator = createOperator(config, tools, memory)

  // 6. Mastra instance
  const mastra = new Mastra({
    agents: { operator },
    storage: mastraStorage,
    memory: { default: memory },
    logger: getLogger(env),
  })

  // Cache in server mode
  if (!isServerless()) {
    _cached = mastra
  }

  return mastra
}

/**
 * Clear the cached Mastra instance.
 * Call this when config changes to force re-creation.
 */
export function clearMastraCache(): void {
  _cached = null
}
