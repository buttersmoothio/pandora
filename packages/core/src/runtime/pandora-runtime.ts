import type { Mastra } from '@mastra/core'
import type { Channel } from '@pandorakit/sdk/channels'
import type { Config } from '../config'
import { getConfig, updateConfig } from '../config'
import { createSendToTools } from '../inbox/tools'
import { getLogger } from '../logger'
import { createMemory } from '../memory'
import type { Scheduler } from '../scheduler'
import { createScheduler } from '../scheduler'
import { createScheduleTools } from '../scheduler/tools'
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
  web: WebGateway
  readonly streams: {
    store(chatId: string, sseStream: ReadableStream<string>): void
    getResume(chatId: string): ReadableStream<string> | null
    getActiveIds(): string[]
  }
  config: Config
  mastra: Mastra
  channels: Map<string, Channel>
  channelNames: Map<string, string>
  scheduler: Scheduler

  syncSchedule(): void
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

  // 3. Mutable ref for schedule tools (tools are created before runtime exists)
  const runtimeRef: { current: PandoraRuntime | null } = { current: null }

  // Build mutable state
  const state = await buildState(registry, config, env, storage, runtimeRef)

  // 4. Scheduler
  const taskHandler = createTaskHandler(runtimeRef, env)
  const onComplete = async (taskId: string) => {
    log.info('[scheduler] task completed, removing from schedule', { taskId })
    const rt = runtimeRef.current
    if (!rt) return
    const tasks = rt.config.schedule.tasks.filter((t) => t.id !== taskId)
    const updated = await updateConfig(
      storage.config,
      { schedule: { enabled: rt.config.schedule.enabled, tasks } },
      registry,
    )
    rt.config = updated
    rt.syncSchedule()
  }
  const scheduler = createScheduler(taskHandler, onComplete)

  const runtime: PandoraRuntime = {
    registry,
    storage,
    config: state.config,
    mastra: state.mastra,
    channels: state.channels,
    channelNames: state.channelNames,
    web: state.web,
    scheduler,

    streams: {
      store: storeStream,
      getResume: getResumeStream,
      getActiveIds: getActiveStreamIds,
    },

    syncSchedule() {
      if (runtime.config.schedule.enabled) {
        runtime.scheduler.sync(runtime.config.schedule.tasks)
      } else {
        runtime.scheduler.stop()
      }
    },

    async reload() {
      log.info('[runtime] reloading')
      // Stop realtime channels
      await stopRealtimeChannels(runtime.channels)

      // Re-read config
      const freshConfig = await getConfig(storage.config, registry)
      const fresh = await buildState(registry, freshConfig, env, storage, runtimeRef)

      runtime.config = fresh.config
      runtime.mastra = fresh.mastra
      runtime.channels = fresh.channels
      runtime.channelNames = fresh.channelNames
      runtime.web = fresh.web

      // Sync schedule after reload
      runtime.syncSchedule()

      // Start realtime channels
      await startRealtimeChannels(runtime)
    },

    async close() {
      runtime.scheduler.stop()
      await stopRealtimeChannels(runtime.channels)
      await storage.close?.()
    },
  }

  // Set the ref so schedule tools can access runtime
  runtimeRef.current = runtime

  // Initial schedule sync
  runtime.syncSchedule()

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
  runtimeRef: { current: PandoraRuntime | null },
) {
  const log = getLogger(env)

  // 3. Tools (plugin tools + schedule tools when enabled)
  const pluginTools = await loadTools(registry, config, env)
  const scheduleTools = config.schedule.enabled
    ? createScheduleTools({
        configStore: storage.config,
        registry,
        runtimeRef,
      })
    : {}
  const tools = { ...pluginTools, ...scheduleTools }
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
  const { channels, channelNames } = await loadChannels(registry, config, env)

  // 10. Gateways
  const { web } = createGateways({ mastra, env })

  return { config, mastra, channels, channelNames, web }
}

function createTaskHandler(
  runtimeRef: { current: PandoraRuntime | null },
  env: Record<string, string | undefined>,
) {
  const log = getLogger(env)
  return async (task: import('../config').ScheduledTask) => {
    const runtime = runtimeRef.current
    if (!runtime) {
      log.error('[scheduler] runtime not available for task', { taskId: task.id })
      return
    }
    const threadId = `schedule-${task.id}`
    const agent = runtime.mastra.getAgent('operator')
    const sendToTools = createSendToTools({
      inboxStore: runtime.storage.inbox,
      threadId,
      channels: runtime.channels,
      channelNames: runtime.channelNames,
      destination: task.destination,
    })
    log.info('[scheduler] executing task', { taskId: task.id, name: task.name })
    await agent.generate(
      [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: task.prompt }] }],
      {
        memory: {
          thread: {
            id: threadId,
            metadata: { root: true, source: 'schedule', taskId: task.id },
          },
          resource: 'default',
        },
        toolsets: { notifications: sendToTools },
      },
    )
  }
}

async function startRealtimeChannels(runtime: PandoraRuntime): Promise<void> {
  const log = getLogger()
  const { channel } = createGateways({ mastra: runtime.mastra, env: {} })

  for (const [nsKey, adapter] of runtime.channels) {
    if (!adapter.realtime) continue
    try {
      await adapter.realtime.start(channel(nsKey))
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
