import type { Config } from '../config'
import { getLogger } from '../logger'
import type { Alert } from '../plugin-types'
import { bindToolExport, buildManifest } from '../tools/define'
import type { ToolPluginConfig, ToolRecord } from '../tools/types'
import { validatePluginConfig } from './config-validate'
import type { PluginRegistry, RegisteredPlugin } from './plugin-registry'

/** Build a namespaced tool key: `pluginId:toolId` */
function namespacedKey(pluginId: string, toolId: string): string {
  return `${pluginId}:${toolId}`
}

function loadStaticTools(
  plugin: RegisteredPlugin,
  envVars: Record<string, string | undefined>,
  pluginConfig: ToolPluginConfig,
): ToolRecord {
  if (!plugin.tools) return {}
  const tools: ToolRecord = {}
  const manifestDefault = plugin.tools.requireApproval ?? false
  const perTool = (pluginConfig.requireApproval ?? {}) as Record<string, boolean>
  for (const exp of plugin.tools.entries) {
    const nsKey = namespacedKey(plugin.id, exp.id)
    const tool = bindToolExport(exp, envVars, pluginConfig, nsKey)
    if (perTool[exp.id] ?? manifestDefault) {
      tool.requireApproval = true
    }
    tools[nsKey] = tool
  }
  return tools
}

export async function loadTools(
  registry: PluginRegistry,
  config: Config,
  envVars: Record<string, string | undefined>,
): Promise<ToolRecord> {
  const result: ToolRecord = {}

  const log = getLogger()

  for (const [, plugin] of registry.plugins) {
    if (!plugin.tools) continue

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) continue

    const missingEnv = (plugin.envVars ?? []).filter(
      (v) => v.required !== false && !envVars[v.name],
    )
    if (missingEnv.length > 0) {
      log.debug(
        `Plugin ${plugin.id} tools skipped (missing env: ${missingEnv.map((v) => v.name).join(', ')})`,
      )
      continue
    }

    Object.assign(result, loadStaticTools(plugin, envVars, pluginConfig))

    if (plugin.tools.resolveTools) {
      const { tools: resolved } = await plugin.tools.resolveTools({
        pluginConfig,
        env: envVars,
      })
      for (const exp of resolved) {
        const nsKey = namespacedKey(plugin.id, exp.id)
        plugin.tools.manifests.set(exp.id, buildManifest(exp))
        result[nsKey] = bindToolExport(exp, envVars, pluginConfig, nsKey)
      }
    }
  }

  return result
}

export function getPluginAlerts(_registry: PluginRegistry, _config: Config): Map<string, Alert[]> {
  // Alerts are populated per-load, stored externally if needed
  return new Map()
}
