import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { Hono } from 'hono'
import {
  getAgentAlerts,
  getAgentPluginValidationErrors,
  getAgentUseToolIds,
  getAllAgentManifests,
  getPluginAgentIds,
} from '../agents'
import { getAllChannels } from '../channels'
import { getConfig } from '../config'
import { getAllPlugins } from '../plugins/registry'
import { getStorage } from '../storage'
import {
  getAllRegisteredToolPlugins,
  getManifest,
  getPluginAlerts,
  getPluginToolIds,
  getPluginValidationErrors,
} from '../tools'
import type { Env } from './helpers'
import { ensureChannelsLoaded } from './helpers'

const discoveryRoutes = new Hono<Env>()

// Unified plugins endpoint — one entry per manifest
discoveryRoutes.get('/plugins', async (c) => {
  await ensureChannelsLoaded(c.var.envVars)

  const { config: configStore } = await getStorage(c.var.envVars, c.env)
  const config = await getConfig(configStore)

  const allPlugins = getAllPlugins()
  const toolValidationErrors = getPluginValidationErrors(config)
  const agentValidationErrors = getAgentPluginValidationErrors(config)

  // Precompute lookups used inside the loop
  const toolPluginMap = new Map(getAllRegisteredToolPlugins().map((tp) => [tp.id, tp]))
  const loadedChannels = getAllChannels()
  const loadedChannelMap = new Map(loadedChannels.map((ch) => [ch.id, ch]))
  const agentManifests = getAllAgentManifests()

  const result = allPlugins.map((plugin) => {
    const pluginConfig = config.plugins[plugin.id]
    const descriptors = plugin.envVars ?? []
    const envVars = descriptors.map((d) => ({ ...d, configured: !!c.var.envVars[d.name] }))
    const envConfigured = envVars.filter((d) => d.required !== false).every((d) => d.configured)

    const provides: Record<string, unknown> = {}

    if (plugin.provides.includes('tools')) {
      const tp = toolPluginMap.get(plugin.id)
      provides.tools = {
        toolIds: getPluginToolIds(plugin.id),
        sandbox: tp?.sandbox ?? 'compartment',
        permissions: tp?.permissions,
        alerts: getPluginAlerts(plugin.id),
      }
    }

    if (plugin.provides.includes('agents')) {
      const agentIds = getPluginAgentIds(plugin.id)
      const agentCfg = (pluginConfig as Record<string, unknown> | undefined)?.agents as
        | Record<string, unknown>
        | undefined
      const agents = agentIds
        .map((id) => agentManifests[id])
        .filter(Boolean)
        .map((m) => {
          const ac = agentCfg?.[m.id] as { model?: unknown } | undefined
          const tools = getAgentUseToolIds(m.id)
            .map((id) => getManifest(id))
            .filter((tm): tm is NonNullable<typeof tm> => !!tm)
          return { ...m, model: ac?.model, tools, alerts: getAgentAlerts(m.id) }
        })
      provides.agents = {
        agentIds,
        agents,
        alerts: agentIds.flatMap((id) => getAgentAlerts(id)),
      }
    }

    if (plugin.provides.includes('channels')) {
      const adapterId = plugin.id.replace(/^channel-/, '')
      const adapter = loadedChannelMap.get(adapterId)
      provides.channels = {
        loaded: !!adapter,
        webhook: adapter ? !!adapter.webhook : null,
        realtime: adapter ? !!adapter.realtime : null,
      }
    }

    if (plugin.provides.includes('storage')) {
      const activeId = c.var.envVars.STORAGE_PROVIDER ?? 'storage-libsql'
      provides.storage = { active: plugin.id === activeId }
    }

    if (plugin.provides.includes('vector')) {
      const activeId = c.var.envVars.VECTOR_PROVIDER ?? 'vector-libsql'
      provides.vector = { active: plugin.id === activeId }
    }

    // Determine default enabled state
    const isInfraPlugin = plugin.provides.includes('storage') || plugin.provides.includes('vector')
    const defaultEnabled = isInfraPlugin ? true : !plugin.provides.includes('channels')

    // Merge validation errors from all capability registries
    const validationErrors = [
      ...(toolValidationErrors[plugin.id] ?? []),
      ...(agentValidationErrors[plugin.id] ?? []),
    ]

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
      enabled: pluginConfig?.enabled ?? defaultEnabled,
      config: pluginConfig ?? {},
      provides,
      validationErrors,
    }
  })

  return c.json({ plugins: result })
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
