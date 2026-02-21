import type { Mastra } from '@mastra/core'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { createChannelRuntime } from './runtime'
import type { ChannelAdapter, ChannelFactory, ChannelRuntime } from './types'

/** Known channel packages, imported as `@pandora/channel-${name}` */
const KNOWN_CHANNELS = ['telegram', 'discord', 'slack'] as const

/** Registry of loaded channel adapters */
const registry = new Map<string, ChannelAdapter>()

/** Track which realtime channels are running */
const realtimeRunning = new Set<string>()

/**
 * Load all known channel packages.
 *
 * Channels auto-load when their package is installed and the factory
 * returns a non-null adapter (i.e. required env vars are present).
 * Config can explicitly disable a channel.
 */
export async function loadChannels(
  env: Record<string, string | undefined>,
  channelConfig: Config['channels'],
): Promise<void> {
  const log = getLogger()

  for (const name of KNOWN_CHANNELS) {
    // Skip if explicitly disabled in config
    if (channelConfig[name]?.enabled === false) {
      log.debug(`Channel ${name} disabled by config`)
      continue
    }

    try {
      const mod = (await import(`@pandora/channel-${name}`)) as {
        default?: ChannelFactory
        createChannel?: ChannelFactory
      }

      const factory = mod.default ?? mod.createChannel
      if (typeof factory !== 'function') {
        log.warn(`Channel package @pandora/channel-${name} has no factory export`)
        continue
      }

      const adapter = factory(env)
      if (!adapter) {
        log.debug(`Channel ${name} skipped (missing env vars)`)
        continue
      }

      registry.set(adapter.id, adapter)
      log.info(`Channel loaded: ${adapter.name} (${adapter.id})`)
    } catch {
      // Package not installed — skip silently
    }
  }
}

/** Get a loaded channel by ID */
export function getChannel(id: string): ChannelAdapter | undefined {
  return registry.get(id)
}

/** Get all loaded channels */
export function getAllChannels(): ChannelAdapter[] {
  return [...registry.values()]
}

/** Start all realtime channels */
export async function startRealtimeChannels(
  mastra: Mastra,
  env: Record<string, string | undefined>,
): Promise<void> {
  const log = getLogger()
  const runtime = createChannelRuntime({ mastra, env })

  for (const adapter of registry.values()) {
    if (!adapter.realtime) continue

    try {
      await adapter.realtime.start(runtime)
      realtimeRunning.add(adapter.id)
      log.info(`Realtime channel started: ${adapter.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to start realtime channel ${adapter.name}`, { error: message })
    }
  }
}

/** Stop all running realtime channels */
export async function stopRealtimeChannels(): Promise<void> {
  const log = getLogger()

  for (const id of realtimeRunning) {
    const adapter = registry.get(id)
    if (!adapter?.realtime) continue

    try {
      await adapter.realtime.stop()
      log.info(`Realtime channel stopped: ${adapter.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to stop realtime channel ${adapter.name}`, { error: message })
    }
  }

  realtimeRunning.clear()
}

/** Verify a webhook request signature before constructing the runtime */
export async function verifyWebhook(
  channelId: string,
  request: Request,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  const adapter = registry.get(channelId)
  if (!adapter?.webhook) return false
  return adapter.webhook.verify(request, env)
}

/** Handle a webhook request for a specific channel */
export function handleWebhook(
  channelId: string,
  request: Request,
  runtime: ChannelRuntime,
): Promise<Response> | null {
  const adapter = registry.get(channelId)
  if (!adapter?.webhook) return null
  return adapter.webhook.handle(request, runtime)
}

/** Clear the registry. Useful for testing. */
export function clearChannelRegistry(): void {
  registry.clear()
  realtimeRunning.clear()
}
