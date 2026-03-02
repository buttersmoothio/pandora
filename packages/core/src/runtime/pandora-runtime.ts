import type { Mastra } from '@mastra/core'
import type { Channel } from '@pandorakit/sdk/channels'
import type { Config } from '../config'
import { getConfig } from '../config'
import { getLogger } from '../logger'
import { createMemory } from '../memory'
import type { StorageResult } from '../storage'
import { createStorage } from '../storage'
import { createVector } from '../vector'
import type { WebGateway } from './gateways'
import { createGateways } from './gateways'
import { loadAgents } from './load-agents'
import { loadChannels } from './load-channels'
import { loadTools } from './load-tools'
import type { PluginRegistry } from './plugin-registry'
import { getActiveStreamIds, getResumeStream, storeStream } from './stream-store'

export interface PandoraRuntime {
  readonly registry: PluginRegistry
  readonly storage: StorageResult
  readonly web: WebGateway
  readonly streams: {
    store(chatId: string, sseStream: ReadableStream<string>): void
    getResume(chatId: string): ReadableStream<string> | null
    getActiveIds(): string[]
  }
  config: Config
  mastra: Mastra
  channels: Map<string, Channel>

  reload(): Promise<void>
  close(): Promise<void>
}

export async function createRuntime(
  registry: PluginRegistry,
  env: Record<string, string | undefined>,
): Promise<PandoraRuntime> {
  const log = getLogger(env)

  // 1. Storage — direct libsql
  const storage = await createStorage(env)

  // 2. Config
  const config = await getConfig(storage.config, registry)

  // Build mutable state
  const state = await buildState(registry, config, env, storage)

  const runtime: PandoraRuntime = {
    registry,
    storage,
    config: state.config,
    mastra: state.mastra,
    channels: state.channels,
    web: state.web,

    streams: {
      store: storeStream,
      getResume: getResumeStream,
      getActiveIds: getActiveStreamIds,
    },

    async reload() {
      log.info('[runtime] reloading')
      // Stop realtime channels
      await stopRealtimeChannels(runtime.channels)

      // Re-read config
      const freshConfig = await getConfig(storage.config, registry)
      const fresh = await buildState(registry, freshConfig, env, storage)

      runtime.config = fresh.config
      runtime.mastra = fresh.mastra
      runtime.channels = fresh.channels
      // web gateway is reassigned via closure in buildState
      ;(runtime as { web: WebGateway }).web = fresh.web

      // Start realtime channels
      await startRealtimeChannels(runtime)
    },

    async close() {
      await stopRealtimeChannels(runtime.channels)
      await storage.close?.()
    },
  }

  // Start realtime channels on initial creation
  await startRealtimeChannels(runtime)

  return runtime
}

// -- Internal helpers --

async function buildState(
  registry: PluginRegistry,
  config: Config,
  env: Record<string, string | undefined>,
  storage: StorageResult,
) {
  const log = getLogger(env)

  // 3. Tools
  const tools = await loadTools(registry, config, env)
  log.info('[runtime] loaded tools', { toolIds: Object.keys(tools) })

  // 4. Vector (for semantic recall)
  const vectorResult = config.memory.semanticRecall.enabled ? await createVector(env) : null
  if (!config.memory.semanticRecall.enabled) {
    log.debug('[runtime] semantic recall disabled, skipping vector store')
  }

  // 5. Memory
  const memory = createMemory({ config, vector: vectorResult })

  // 6. Subagents
  const subagents = await loadAgents(registry, config, memory, env, tools)
  if (Object.keys(subagents).length > 0) {
    log.info('[runtime] loaded subagents', { agentIds: Object.keys(subagents) })
  }

  // 7. Operator agent
  const { createOperator } = await import('../agents/operator')
  const operator = createOperator(config, tools, memory, subagents)

  // 8. Mastra instance
  const { Mastra } = await import('@mastra/core')
  const mastra = new Mastra({
    agents: { operator, ...subagents },
    storage: storage.mastra,
    memory: { default: memory },
    logger: getLogger(env),
  })

  // 9. Channels
  const channels = await loadChannels(registry, config, env)

  // 10. Gateways
  const { web } = createGateways({ mastra, env })

  return { config, mastra, channels, web }
}

async function startRealtimeChannels(runtime: PandoraRuntime): Promise<void> {
  const log = getLogger()
  const { channel } = createGateways({ mastra: runtime.mastra, env: {} })

  for (const adapter of runtime.channels.values()) {
    if (!adapter.realtime) continue
    try {
      await adapter.realtime.start(channel(adapter.id))
      log.info(`Realtime channel started: ${adapter.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to start realtime channel ${adapter.name}`, { error: message })
    }
  }
}

async function stopRealtimeChannels(channels: Map<string, Channel>): Promise<void> {
  const log = getLogger()
  for (const adapter of channels.values()) {
    if (!adapter.realtime) continue
    try {
      await adapter.realtime.stop()
      log.info(`Realtime channel stopped: ${adapter.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to stop realtime channel ${adapter.name}`, { error: message })
    }
  }
}
