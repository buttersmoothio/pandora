import { Mastra } from '@mastra/core'
import type { Channel } from '@pandorakit/sdk/channels'
import type { Disk } from 'flydrive'
import { createOperator } from '../agents/operator'
import type { Config, ScheduledTask } from '../config'
import { getConfig, updateConfig } from '../config'
import { createFileDisk } from '../files/disk'
import { createSendToTools } from '../inbox/tools'
import { getLogger } from '../logger'
import type { McpManager } from '../mcp'
import { createMcpManager } from '../mcp'
import { createMemory } from '../memory'
import type { Scheduler } from '../scheduler'
import { createScheduler } from '../scheduler'
import {
  buildHeartbeatPrompt,
  createHeartbeatTask,
  HEARTBEAT_TASK_ID,
  isWithinActiveHours,
} from '../scheduler/heartbeat'
import { createScheduleTools } from '../scheduler/tools'
import type { StorageResult } from '../storage'
import { createStorage } from '../storage'
import { createCurrentTimeTool } from '../tools/current-time'
import type { ToolRecord } from '../tools/types'
import { createChannelGateway } from './channel-gateway'
import { loadAgents } from './load-agents'
import { loadChannels } from './load-channels'
import { loadTools } from './load-tools'
import type { PluginRegistry } from './plugin-registry'
import { getActiveStreamIds, getResumeStream, storeStream } from './stream-store'
import { createWebGateway, type WebGateway } from './web-gateway'

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
  interactiveTools: ToolRecord
  mcpManager: McpManager | null
  fileDisk: Disk
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
    if (taskId === HEARTBEAT_TASK_ID) return
    log.info('[scheduler] task completed, removing from schedule', { taskId })
    const rt = runtimeRef.current
    if (!rt) return
    const tasks = rt.config.schedule.tasks.filter((t) => t.id !== taskId)
    const updated = await updateConfig(
      storage.config,
      { schedule: { ...rt.config.schedule, tasks } },
      registry,
    )
    rt.config = updated
    rt.syncSchedule()
  }
  const scheduler = createScheduler(taskHandler, onComplete, config.timezone)

  // Serialization lock for reload — prevents concurrent mutations from racing
  let reloadLock: Promise<void> = Promise.resolve()

  const runtime: PandoraRuntime = {
    registry,
    storage,
    config: state.config,
    mastra: state.mastra,
    channels: state.channels,
    channelNames: state.channelNames,
    interactiveTools: state.interactiveTools,
    mcpManager: state.mcpManager,
    fileDisk: state.fileDisk,
    web: state.web,
    scheduler,

    streams: {
      store: storeStream,
      getResume: getResumeStream,
      getActiveIds: getActiveStreamIds,
    },

    syncSchedule() {
      if (runtime.config.schedule.enabled) {
        const tasks = [...runtime.config.schedule.tasks]
        if (runtime.config.schedule.heartbeat.enabled) {
          tasks.push(createHeartbeatTask(runtime.config.schedule.heartbeat))
        }
        runtime.scheduler.sync(tasks, runtime.config.timezone)
      } else {
        runtime.scheduler.stop()
      }
    },

    async reload() {
      const prev = reloadLock
      let resolve: (() => void) | undefined
      reloadLock = new Promise((r) => {
        resolve = r
      })
      await prev

      try {
        log.info('[runtime] reloading')
        // Stop realtime channels
        await stopRealtimeChannels(runtime.channels)

        // Disconnect existing MCP servers
        if (runtime.mcpManager) await runtime.mcpManager.disconnect()

        // Re-read config
        const freshConfig = await getConfig(storage.config, registry)
        const fresh = await buildState(registry, freshConfig, env, storage, runtimeRef)

        runtime.config = fresh.config
        runtime.mastra = fresh.mastra
        runtime.channels = fresh.channels
        runtime.channelNames = fresh.channelNames
        runtime.interactiveTools = fresh.interactiveTools
        runtime.mcpManager = fresh.mcpManager
        runtime.fileDisk = fresh.fileDisk
        runtime.web = fresh.web

        // Sync schedule after reload
        runtime.syncSchedule()

        // Start realtime channels
        await startRealtimeChannels(runtime)
      } finally {
        resolve?.()
      }
    },

    async close() {
      runtime.scheduler.stop()
      await stopRealtimeChannels(runtime.channels)
      if (runtime.mcpManager) await runtime.mcpManager.disconnect()
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

  // 3. Channels (loaded early so schedule tools can enumerate destinations)
  const { channels, channelNames } = await loadChannels(registry, config, env)

  const notifiableNames: string[] = []
  for (const [friendlyName, nsKey] of channelNames) {
    const channel = channels.get(nsKey)
    if (channel?.notify) notifiableNames.push(friendlyName)
  }
  const destinations: [string, ...string[]] = ['Web Inbox', ...notifiableNames]

  // 4. Tools (built-in + plugin + MCP + schedule tools)
  const builtinTools = { current_time: createCurrentTimeTool(config.timezone) }
  const pluginTools = await loadTools(registry, config, env)
  const mcpManager = await createMcpManager(config, env, storage.mcpOAuth)
  const scheduleTools = config.schedule.enabled
    ? createScheduleTools({
        configStore: storage.config,
        registry,
        runtimeRef,
        destinations,
      })
    : {}
  const allTools = { ...builtinTools, ...pluginTools, ...mcpManager.tools, ...scheduleTools }
  const backgroundTools = getBackgroundTools(allTools)
  const interactiveTools: ToolRecord = {}
  for (const [key, tool] of Object.entries(allTools)) {
    if (!(key in backgroundTools)) interactiveTools[key] = tool
  }
  log.info('[runtime] loaded tools', { toolIds: Object.keys(allTools) })

  // 5. File storage
  const fileDisk = createFileDisk(env)
  const port = env.PORT ?? '4111'
  const baseUrl = env.BASE_URL ?? `http://localhost:${port}`

  // 6. Memory
  const memory = createMemory(config)

  // 6. Subagents
  const subagents = await loadAgents(registry, config, memory, env, allTools)
  if (Object.keys(subagents).length > 0) {
    log.info('[runtime] loaded subagents', { agentIds: Object.keys(subagents) })
  }

  // 7. Operator agent (background-only tools; interactive tools added via toolsets)
  const operator = createOperator(config, backgroundTools, memory, fileDisk, baseUrl, subagents)

  // 8. Mastra instance
  const mastra = new Mastra({
    agents: { operator, ...subagents },
    storage: storage.mastra,
    memory: { default: memory },
    logger: getLogger(env),
  })

  // 9. Web gateway
  const web = createWebGateway({ mastra, interactiveTools })

  return { config, mastra, channels, channelNames, interactiveTools, mcpManager, fileDisk, web }
}

function createTaskHandler(
  runtimeRef: { current: PandoraRuntime | null },
  env: Record<string, string | undefined>,
) {
  const log = getLogger(env)
  return async (task: ScheduledTask) => {
    const runtime = runtimeRef.current
    if (!runtime) {
      log.error('[scheduler] runtime not available for task', { taskId: task.id })
      return
    }

    // Heartbeat: special handling
    if (task.id === HEARTBEAT_TASK_ID) {
      const heartbeat = runtime.config.schedule.heartbeat
      if (!isWithinActiveHours(heartbeat.activeHours, runtime.config.timezone)) {
        log.info('[scheduler] heartbeat skipped — outside active hours')
        return
      }
      const prompt = buildHeartbeatPrompt(heartbeat.tasks)
      if (!prompt) {
        log.info('[scheduler] heartbeat skipped — no enabled checks')
        return
      }
      const threadId = `heartbeat-${crypto.randomUUID()}`
      const agent = runtime.mastra.getAgent('operator')
      const sendToTools = createSendToTools({
        inboxStore: runtime.storage.inbox,
        threadId,
        channels: runtime.channels,
        channelNames: runtime.channelNames,
        destination: heartbeat.destination,
      })
      log.info('[scheduler] executing heartbeat')
      await agent.generate(
        [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] }],
        {
          memory: {
            thread: {
              id: threadId,
              metadata: { root: true, source: 'heartbeat' },
            },
            resource: 'default',
          },
          toolsets: { notifications: sendToTools },
        },
      )
      log.info('[scheduler] heartbeat complete')
      return
    }

    // Regular scheduled task
    const threadId = `schedule-${task.id}`
    const agent = runtime.mastra.getAgent('operator')
    const sendToTools = createSendToTools({
      inboxStore: runtime.storage.inbox,
      threadId,
      channels: runtime.channels,
      channelNames: runtime.channelNames,
      destination: task.destination,
    })
    const prompt = task.destination
      ? `${task.prompt}\n\nSend the result to ${task.destination}.`
      : task.prompt
    log.info('[scheduler] executing task', { taskId: task.id, name: task.name })
    await agent.generate(
      [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] }],
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

/** Filter tools to only read-only, non-approval MCP tools for background execution. */
function getBackgroundTools(tools: ToolRecord): ToolRecord {
  const result: ToolRecord = {}
  for (const [key, tool] of Object.entries(tools)) {
    if (hasProperty(tool, 'requireApproval') && tool.requireApproval) continue
    if (
      !(
        hasProperty(tool, 'mcp') &&
        hasProperty(tool.mcp, 'annotations') &&
        hasProperty(tool.mcp.annotations, 'readOnlyHint') &&
        tool.mcp.annotations.readOnlyHint
      )
    ) {
      continue
    }
    result[key] = tool
  }
  return result
}

function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj
}

async function startRealtimeChannels(runtime: PandoraRuntime): Promise<void> {
  const log = getLogger()
  const channel = createChannelGateway({
    mastra: runtime.mastra,
    env: {},
    interactiveTools: runtime.interactiveTools,
  })

  for (const [nsKey, adapter] of runtime.channels) {
    if (!adapter.realtime) continue
    try {
      await adapter.realtime.start(channel(nsKey))
      log.info('[runtime] realtime channel started', { name: adapter.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('[runtime] failed to start realtime channel', {
        name: adapter.name,
        error: message,
      })
    }
  }
}

async function stopRealtimeChannels(channels: Map<string, Channel>): Promise<void> {
  const log = getLogger()
  for (const adapter of channels.values()) {
    if (!adapter.realtime) continue
    try {
      await adapter.realtime.stop()
      log.info('[runtime] realtime channel stopped', { name: adapter.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('[runtime] failed to stop realtime channel', { name: adapter.name, error: message })
    }
  }
}
