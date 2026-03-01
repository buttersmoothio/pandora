import type { Config } from '../config'
import type { Alert } from '../plugin-types'
import { bindToolExport, buildManifest } from '../tools/define'
import type { ToolPluginConfig, ToolRecord } from '../tools/types'
import { validatePluginConfig } from './config-validate'
import type { PluginRegistry, RegisteredPlugin } from './plugin-registry'

function loadStaticTools(
  plugin: RegisteredPlugin,
  envVars: Record<string, string | undefined>,
  pluginConfig: ToolPluginConfig,
): ToolRecord {
  if (!plugin.tools) return {}
  const tools: ToolRecord = {}
  // User config overrides manifest default
  const requireApproval = pluginConfig.requireApproval ?? plugin.tools.requireApproval ?? false
  for (const exp of plugin.tools.entries) {
    const tool = bindToolExport(exp, envVars, pluginConfig)
    if (requireApproval) {
      tool.requireApproval = true
    }
    tools[exp.id] = tool
  }
  return tools
}

export async function loadTools(
  registry: PluginRegistry,
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  const result: ToolRecord = {}

  for (const [, plugin] of registry.plugins) {
    if (!plugin.tools) continue

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) continue

    Object.assign(result, loadStaticTools(plugin, envVars, pluginConfig))

    if (plugin.tools.resolveTools) {
      const { tools: resolved } = await plugin.tools.resolveTools({
        pluginConfig,
        env: envVars,
      })
      for (const exp of resolved) {
        plugin.tools.manifests.set(exp.id, buildManifest(exp))
        result[exp.id] = bindToolExport(exp, envVars, pluginConfig)
      }
    }
  }

  return result
}

export function getPluginAlerts(_registry: PluginRegistry, _config: Config): Map<string, Alert[]> {
  // Alerts are populated per-load, stored externally if needed
  return new Map()
}
