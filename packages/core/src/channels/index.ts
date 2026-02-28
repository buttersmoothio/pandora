import type { Mastra } from '@mastra/core'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { buildSchemaFromFields, PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import { registerPluginSchema, removePluginSchema } from '../plugins/schema-registry'
import { validatePluginConfig } from '../plugins/validate'
import { createChannelRuntime } from './runtime'
import type { ChannelAdapter, ChannelPlugin, ChannelRuntime } from './types'

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

const factoryRegistry = new Map<string, ChannelPlugin>()

/**
 * Register a channel plugin.
 *
 * Must be called before channels are loaded (before the first request
 * hits the webhook route). Validates schema version compatibility.
 */
export function registerChannelPlugin(plugin: ChannelPlugin): void {
  if (plugin.schemaVersion !== PLUGIN_SCHEMA_VERSION) {
    throw new Error(
      `Channel plugin '${plugin.id}' uses schema v${plugin.schemaVersion}, ` +
        `but core expects v${PLUGIN_SCHEMA_VERSION}. Update the package.`,
    )
  }
  factoryRegistry.set(plugin.id, plugin)
  if (plugin.configFields?.length) {
    registerPluginSchema(plugin.id, buildSchemaFromFields(plugin.configFields))
  }
}

// ---------------------------------------------------------------------------
// Adapter registry (instantiated channels)
// ---------------------------------------------------------------------------

/** Registry of loaded channel adapters */
const registry = new Map<string, ChannelAdapter>()

/** Track which realtime channels are running */
const realtimeRunning = new Set<string>()

/**
 * Load all registered channel plugins.
 *
 * Channels auto-load when their plugin is registered and the factory
 * returns a non-null adapter (i.e. required env vars are present).
 * Config can explicitly disable a channel.
 */
export async function loadChannels(
  env: Record<string, string | undefined>,
  pluginConfig: Config['plugins'],
): Promise<void> {
  const log = getLogger()

  for (const [, plugin] of factoryRegistry) {
    const { config } = validatePluginConfig(plugin.id, pluginConfig[plugin.id])
    if (!config) continue

    try {
      const adapter = plugin.factory(env, config)
      if (!adapter) {
        log.debug(`Channel ${plugin.id} skipped (missing env vars)`)
        continue
      }

      registry.set(adapter.id, adapter)
      log.info(`Channel loaded: ${adapter.name} (${adapter.id})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Failed to load channel ${plugin.id}`, { error: message })
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

/** Get all registered channel plugins (regardless of load status) */
export function getAllRegisteredChannelPlugins(): ChannelPlugin[] {
  return [...factoryRegistry.values()]
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

/**
 * Reload all channels: stop realtime, clear adapters, reload from config, restart realtime.
 * Called when channel config changes at runtime.
 */
export async function reloadChannels(
  mastra: Mastra,
  env: Record<string, string | undefined>,
  pluginConfig: Config['plugins'],
): Promise<void> {
  await stopRealtimeChannels()
  registry.clear()
  await loadChannels(env, pluginConfig)
  await startRealtimeChannels(mastra, env)
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

/** Clear the registries. Useful for testing. */
export function clearChannelPlugins(): void {
  for (const id of factoryRegistry.keys()) removePluginSchema(id)
  factoryRegistry.clear()
  registry.clear()
  realtimeRunning.clear()
}
