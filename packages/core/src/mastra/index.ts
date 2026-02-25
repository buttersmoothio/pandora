import { Mastra } from '@mastra/core'
import { loadAgents } from '../agents'
import { createOperator } from '../agents/operator'
import { getConfig } from '../config'
import { isServerless } from '../env'
import { getLogger } from '../logger'
import { createMemory } from '../memory'
import { getStorage } from '../storage'
import { loadTools } from '../tools'
import { getVector } from '../vector'

/** Cached Mastra instance for server mode */
let _cached: Mastra | null = null

/**
 * Get a configured Mastra instance.
 *
 * In server mode, caches the instance for the process lifetime.
 * In serverless mode, creates a fresh instance per invocation.
 * */
export async function getMastra(
  env: Record<string, string | undefined>,
  bindings?: unknown,
): Promise<Mastra> {
  const log = getLogger(env)
  if (!isServerless() && _cached) {
    log.debug('[getMastra] returning cached instance')
    return _cached
  }
  log.info('[getMastra] creating new Mastra instance')

  // 1. Storage
  const { mastra: mastraStorage, config: configStore } = await getStorage(env, bindings)

  // 2. Config
  const config = await getConfig(configStore)

  // 3. Tools
  const tools = await loadTools(config, env)
  log.info('[getMastra] loaded tools', { toolIds: Object.keys(tools) })

  // 4. Vector (for semantic recall)
  const vectorResult = config.memory.semanticRecall.enabled ? await getVector(env, bindings) : null
  if (config.memory.semanticRecall.enabled) {
    log.info('[getMastra] semantic recall enabled', {
      hasVector: !!vectorResult,
      embedder: config.memory.semanticRecall.embedder,
    })
  }

  // 5. Memory
  const memory = createMemory({ config, vector: vectorResult })

  // 6. Subagents (from agent plugins)
  const subagents = await loadAgents(config, env, memory)
  if (Object.keys(subagents).length > 0) {
    log.info('[getMastra] loaded subagents', { agentIds: Object.keys(subagents) })
  }

  // 7. Operator agent
  const operator = createOperator(config, tools, memory, subagents)

  // 8. Mastra instance
  const mastra = new Mastra({
    agents: { operator, ...subagents },
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
