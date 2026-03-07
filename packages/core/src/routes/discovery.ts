import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import type { PluginConfig } from '@pandorakit/sdk'
import type { Channel } from '@pandorakit/sdk/channels'
import { Hono } from 'hono'
import type { McpServerConfig } from '../mcp/types'
import { validatePluginConfig } from '../runtime/config-validate'
import { encodeNsKey, namespacedKey } from '../runtime/namespace'
import type { PluginRegistry, RegisteredPlugin } from '../runtime/plugin-registry'
import type { Env } from './helpers'

function buildToolsProvides(plugin: RegisteredPlugin) {
  if (!plugin.tools) return undefined
  return {
    toolIds: plugin.tools.entries.map((t) => namespacedKey(plugin.id, t.id)),
    tools: plugin.tools.entries.map((t) => ({
      id: namespacedKey(plugin.id, t.id),
      name: t.name,
      description: t.description,
    })),
    sandbox: plugin.tools.sandbox ?? 'compartment',
    permissions: plugin.tools.permissions,
    requireApproval: plugin.tools.requireApproval ?? false,
    alerts: [],
  }
}

function buildAgentsProvides(
  plugin: RegisteredPlugin,
  registry: PluginRegistry,
  pluginConfig: PluginConfig | undefined,
) {
  if (!plugin.agents) return undefined
  const agents = plugin.agents.definitions.map((def) => {
    const manifest = plugin.agents?.manifests.get(def.id)
    const ac = pluginConfig?.agents?.[def.id]
    const tools = (def.useTools ?? [])
      .map((nsId) => {
        const colonIdx = nsId.lastIndexOf(':')
        if (colonIdx === -1) return undefined
        const pId = nsId.slice(0, colonIdx)
        const tId = nsId.slice(colonIdx + 1)
        const tm = registry.plugins.get(pId)?.tools?.manifests.get(tId)
        if (!tm) return undefined
        return { ...tm, id: nsId }
      })
      .filter((t): t is NonNullable<typeof t> => !!t)
    return {
      ...manifest,
      id: namespacedKey(plugin.id, def.id),
      model: ac?.model,
      tools,
      alerts: [],
    }
  })
  return {
    agentIds: plugin.agents.definitions.map((d) => namespacedKey(plugin.id, d.id)),
    agents,
    alerts: [],
  }
}

function buildChannelsProvides(plugin: RegisteredPlugin, channels: Map<string, Channel>) {
  if (!plugin.channels) return undefined
  const entry = [...channels.entries()].find(([key]) => key.startsWith(`${plugin.id}:`))
  const [nsKey, adapter] = entry ?? []
  return {
    loaded: !!adapter,
    webhook: adapter ? !!adapter.webhook : null,
    realtime: adapter ? !!adapter.realtime : null,
    webhookPath: nsKey ? `/wh/${encodeNsKey(nsKey)}` : null,
  }
}

const discoveryRoutes = new Hono<Env>()

// Unified plugins endpoint — one entry per manifest
discoveryRoutes.get('/plugins', (c) => {
  const { registry, config, channels } = c.var.runtime

  const result = [...registry.plugins.values()].map((plugin) => {
    const pluginConfig = config.plugins[plugin.id]
    const descriptors = plugin.envVars ?? []
    const envVars = descriptors.map((d) => ({ ...d, configured: !!c.var.envVars[d.name] }))
    const envConfigured = envVars.filter((d) => d.required !== false).every((d) => d.configured)

    const provides: {
      tools?: NonNullable<ReturnType<typeof buildToolsProvides>>
      agents?: NonNullable<ReturnType<typeof buildAgentsProvides>>
      channels?: NonNullable<ReturnType<typeof buildChannelsProvides>>
    } = {}
    const tools = buildToolsProvides(plugin)
    if (tools) provides.tools = tools
    const agents = buildAgentsProvides(plugin, registry, pluginConfig)
    if (agents) provides.agents = agents
    const ch = buildChannelsProvides(plugin, channels)
    if (ch) provides.channels = ch

    const { errors: validationErrors } = validatePluginConfig(plugin, pluginConfig)

    return {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      author: plugin.author,
      icon: plugin.icon,
      version: plugin.version,
      homepage: plugin.homepage,
      repository: plugin.repository,
      license: plugin.license,
      envVars,
      envConfigured,
      configFields: plugin.configFields ?? [],
      enabled: pluginConfig?.enabled ?? false,
      config: pluginConfig ?? {},
      provides,
      validationErrors: validationErrors.length > 0 ? validationErrors : [],
    }
  })

  return c.json({ plugins: result })
})

// MCP servers endpoint
discoveryRoutes.get('/mcp-servers', (c) => {
  const { mcpManager, config } = c.var.runtime

  const servers = Object.entries(config.mcpServers).map(([id, raw]) => {
    const sc = raw as McpServerConfig
    const meta = mcpManager?.serverMeta.get(id)
    return {
      id,
      name: sc.name ?? id,
      type: sc.command ? 'stdio' : 'sse',
      enabled: sc.enabled ?? true,
      requireApproval: sc.requireApproval ?? true,
      tools: meta?.tools ?? [],
      error: meta?.error,
    }
  })

  return c.json({ servers })
})

// Models endpoint - returns available providers and models
discoveryRoutes.get('/models', (c) => {
  const providers = Object.entries(PROVIDER_REGISTRY).map(([id, config]) => {
    const keys = Array.isArray(config.apiKeyEnvVar) ? config.apiKeyEnvVar : [config.apiKeyEnvVar]
    const configured = keys.some((key) => !!c.var.envVars[key])
    return {
      id,
      name: config.name,
      models: config.models,
      configured,
      docUrl: config.docUrl,
      gateway: config.gateway,
      envVars: keys,
    }
  })
  return c.json({ providers })
})

export { discoveryRoutes }
