import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { Hono } from 'hono'
import { getAllChannels } from '../channels'
import { getConfig } from '../config'
import { getStorage } from '../storage'
import { getAllManifests } from '../tools'
import type { Env } from './helpers'
import { ensureChannelsLoaded } from './helpers'

const discoveryRoutes = new Hono<Env>()

// Tools endpoint - returns all registered tools with manifests merged with config state
discoveryRoutes.get('/tools', async (c) => {
  const { config: configStore } = await getStorage(c.var.envVars, c.env)
  const config = await getConfig(configStore)

  const manifests = getAllManifests()

  const tools = Object.values(manifests).map((manifest) => {
    const toolConfig = config.tools[manifest.id]
    return {
      ...manifest,
      enabled: toolConfig?.enabled ?? false,
      requireApproval: toolConfig?.requireApproval,
      settings: toolConfig?.settings,
    }
  })

  return c.json({ tools })
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

// Channels endpoint - returns loaded channels with status
discoveryRoutes.get('/channels', async (c) => {
  await ensureChannelsLoaded(c.var.envVars)

  const channels = getAllChannels().map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    webhook: !!adapter.webhook,
    realtime: !!adapter.realtime,
  }))

  return c.json({ channels })
})

export { discoveryRoutes }
