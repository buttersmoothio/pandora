import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { Hono } from 'hono'
import { validatePluginConfig } from '../runtime/config-validate'
import type { Env } from './helpers'

const discoveryRoutes = new Hono<Env>()

// Unified plugins endpoint — one entry per manifest
discoveryRoutes.get('/plugins', (c) => {
  const { registry, config, channels } = c.var.runtime

  const result = [...registry.plugins.values()].map((plugin) => {
    const pluginConfig = config.plugins[plugin.id]
    const descriptors = plugin.envVars ?? []
    const envVars = descriptors.map((d) => ({ ...d, configured: !!c.var.envVars[d.name] }))
    const envConfigured = envVars.filter((d) => d.required !== false).every((d) => d.configured)

    const provides: Record<string, unknown> = {}

    if (plugin.tools) {
      provides.tools = {
        toolIds: plugin.tools.entries.map((t) => t.id),
        sandbox: plugin.tools.sandbox ?? 'compartment',
        permissions: plugin.tools.permissions,
        alerts: [],
      }
    }

    if (plugin.agents) {
      const agents = plugin.agents.definitions.map((def) => {
        const manifest = plugin.agents!.manifests.get(def.id)
        const agentCfg = (pluginConfig as Record<string, unknown> | undefined)?.agents as
          | Record<string, unknown>
          | undefined
        const ac = agentCfg?.[def.id] as { model?: unknown } | undefined
        const tools = (def.useTools ?? [])
          .map((id) => {
            // Look up tool manifest across all plugins
            for (const p of registry.plugins.values()) {
              const tm = p.tools?.manifests.get(id)
              if (tm) return tm
            }
            return undefined
          })
          .filter((tm): tm is NonNullable<typeof tm> => !!tm)
        return { ...manifest, model: ac?.model, tools, alerts: [] }
      })
      provides.agents = {
        agentIds: plugin.agents.definitions.map((d) => d.id),
        agents,
        alerts: [],
      }
    }

    if (plugin.channels) {
      const adapterId = plugin.id.replace(/^channel-/, '')
      const adapter = channels.get(adapterId)
      provides.channels = {
        loaded: !!adapter,
        webhook: adapter ? !!adapter.webhook : null,
        realtime: adapter ? !!adapter.realtime : null,
      }
    }

    // Determine default enabled state
    const defaultEnabled = !plugin.channels

    // Validation errors
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
      enabled: pluginConfig?.enabled ?? defaultEnabled,
      config: pluginConfig ?? {},
      provides,
      validationErrors: validationErrors.length > 0 ? validationErrors : [],
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
