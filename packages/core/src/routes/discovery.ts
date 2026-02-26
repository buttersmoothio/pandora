import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { Hono } from 'hono'
import {
  getAgentAlerts,
  getAgentPluginValidationErrors,
  getAllAgentManifests,
  getAllRegisteredAgentPlugins,
  getPluginAgentIds,
  getScopedToolManifests,
} from '../agents'
import { getAllChannels, getAllRegisteredChannelPlugins } from '../channels'
import { getConfig } from '../config'
import { getStorage } from '../storage'
import {
  getAllManifests,
  getAllRegisteredToolPlugins,
  getPluginAlerts,
  getPluginToolIds,
  getPluginValidationErrors,
} from '../tools'
import type { Env } from './helpers'
import { ensureChannelsLoaded } from './helpers'

const discoveryRoutes = new Hono<Env>()

// Tools endpoint - returns all registered tools with manifests merged with config state
discoveryRoutes.get('/tools', async (c) => {
  const { config: configStore } = await getStorage(c.var.envVars, c.env)
  const config = await getConfig(configStore)

  const manifests = getAllManifests()
  const plugins = getAllRegisteredToolPlugins()
  const validationErrors = getPluginValidationErrors(config)

  const tools = Object.values(manifests).map((manifest) => ({ ...manifest }))

  const toolPlugins = plugins.map((plugin) => {
    const pluginConfig = config.toolPlugins[plugin.id]
    const descriptors = plugin.envVars ?? []
    const envConfigured = descriptors
      .filter((d) => d.required !== false)
      .every((d) => !!c.var.envVars[d.name])
    return {
      id: plugin.id,
      name: plugin.name,
      envVars: descriptors,
      envConfigured,
      configFields: plugin.configFields ?? [],
      enabled: pluginConfig?.enabled ?? true,
      config: pluginConfig ?? {},
      validationErrors: validationErrors[plugin.id] ?? [],
      alerts: getPluginAlerts(plugin.id),
      toolIds: getPluginToolIds(plugin.id),
    }
  })

  return c.json({ tools, plugins: toolPlugins })
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

// Channels endpoint - returns all registered plugins with metadata, config, and status
discoveryRoutes.get('/channels', async (c) => {
  await ensureChannelsLoaded(c.var.envVars)

  const { config: configStore } = await getStorage(c.var.envVars, c.env)
  const config = await getConfig(configStore)
  const loadedChannels = getAllChannels()
  const loadedIds = new Set(loadedChannels.map((ch) => ch.id))

  const channels = getAllRegisteredChannelPlugins().map((plugin) => {
    const channelConfig = config.channels[plugin.id]
    const descriptors = plugin.envVars ?? []
    const envConfigured = descriptors
      .filter((d) => d.required !== false)
      .every((d) => !!c.var.envVars[d.name])
    const adapterId = plugin.id.replace(/^channel-/, '')
    const loaded = loadedIds.has(adapterId)
    const adapter = loadedChannels.find((ch) => ch.id === adapterId)

    return {
      id: plugin.id,
      name: plugin.name,
      envVars: descriptors,
      envConfigured,
      configFields: plugin.configFields ?? [],
      enabled: channelConfig?.enabled ?? false,
      config: channelConfig ?? {},
      loaded,
      webhook: loaded ? !!adapter?.webhook : null,
      realtime: loaded ? !!adapter?.realtime : null,
    }
  })

  return c.json({ channels })
})

// Agents endpoint - returns all registered agent plugins with manifests and config state
discoveryRoutes.get('/agents', async (c) => {
  const { config: configStore } = await getStorage(c.var.envVars, c.env)
  const config = await getConfig(configStore)

  const manifests = getAllAgentManifests()
  const plugins = getAllRegisteredAgentPlugins()
  const validationErrors = getAgentPluginValidationErrors(config)

  const agents = Object.values(manifests).map((manifest) => {
    const agentConfig = config.agents[manifest.id]
    const toolManifests = getScopedToolManifests(manifest.id)
    const toolConfigs = agentConfig?.tools
    const tools = toolManifests.map((tm) => ({
      ...tm,
      enabled: toolConfigs?.[tm.id]?.enabled !== false,
    }))
    return {
      ...manifest,
      enabled: agentConfig?.enabled ?? true,
      model: agentConfig?.model,
      tools,
      alerts: getAgentAlerts(manifest.id),
    }
  })

  const agentPlugins = plugins.map((plugin) => {
    const pluginConfig = config.agentPlugins[plugin.id]
    const descriptors = plugin.envVars ?? []
    const envConfigured = descriptors
      .filter((d) => d.required !== false)
      .every((d) => !!c.var.envVars[d.name])

    // Aggregate alerts from all agents in this plugin
    const pluginAlerts = getPluginAgentIds(plugin.id).flatMap((id) => getAgentAlerts(id))

    return {
      id: plugin.id,
      name: plugin.name,
      envVars: descriptors,
      envConfigured,
      configFields: plugin.configFields ?? [],
      enabled: pluginConfig?.enabled ?? true,
      config: pluginConfig ?? {},
      validationErrors: validationErrors[plugin.id] ?? [],
      alerts: pluginAlerts,
      agentIds: getPluginAgentIds(plugin.id),
    }
  })

  return c.json({ agents, plugins: agentPlugins })
})

export { discoveryRoutes }
