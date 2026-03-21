import type { Alert, PluginConfig } from '@pandorakit/sdk'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { bindTool, buildManifest } from '../tools/define'
import type { ToolRecord } from '../tools/types'
import { validatePluginConfig } from './config-validate'
import { namespacedKey, toolSafeId, validateEntityId } from './namespace'
import type { PluginRegistry, RegisteredPlugin } from './plugin-registry'

function loadStaticTools(
  plugin: RegisteredPlugin,
  envVars: Record<string, string | undefined>,
  pluginConfig: PluginConfig,
): ToolRecord {
  if (!plugin.tools) {
    return {}
  }
  const tools: ToolRecord = {}
  const manifestDefault = plugin.tools.requireApproval ?? false
  const perTool = pluginConfig.requireApproval ?? {}
  for (const exp of plugin.tools.entries) {
    validateEntityId('tool', plugin.id, exp.id)
    const nsKey = namespacedKey(plugin.id, exp.id)
    const safeId = toolSafeId(nsKey)
    const needsApproval = perTool[safeId] ?? manifestDefault
    tools[safeId] = bindTool(exp, envVars, pluginConfig, nsKey, needsApproval || undefined)
  }
  return tools
}

async function loadResolvedTools(
  plugin: RegisteredPlugin,
  envVars: Record<string, string | undefined>,
  pluginConfig: PluginConfig,
): Promise<ToolRecord> {
  if (!plugin.tools?.resolveTools) {
    return {}
  }
  const tools: ToolRecord = {}
  const manifestDefault = plugin.tools.requireApproval ?? false
  const perTool = pluginConfig.requireApproval ?? {}
  const { tools: resolved } = await plugin.tools.resolveTools({
    pluginConfig,
    env: envVars,
  })
  for (const exp of resolved) {
    validateEntityId('tool', plugin.id, exp.id)
    const nsKey = namespacedKey(plugin.id, exp.id)
    const safeId = toolSafeId(nsKey)
    plugin.tools.manifests.set(exp.id, buildManifest(exp))
    const needsApproval = perTool[safeId] ?? manifestDefault
    tools[safeId] = bindTool(exp, envVars, pluginConfig, nsKey, needsApproval || undefined)
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
    if (!plugin.tools) {
      continue
    }

    const { config: pluginConfig } = validatePluginConfig(plugin, config.plugins[plugin.id])
    if (!pluginConfig) {
      continue
    }

    const missingEnv = (plugin.envVars ?? []).filter(
      (v) => v.required !== false && !envVars[v.name],
    )
    if (missingEnv.length > 0) {
      log.debug('[load-tools] plugin tools skipped (missing env)', {
        pluginId: plugin.id,
        missingEnv: missingEnv.map((v) => v.name),
      })
      continue
    }

    Object.assign(result, loadStaticTools(plugin, envVars, pluginConfig))
    Object.assign(result, await loadResolvedTools(plugin, envVars, pluginConfig))
  }

  return result
}

export function getPluginAlerts(_registry: PluginRegistry, _config: Config): Map<string, Alert[]> {
  // Alerts are populated per-load, stored externally if needed
  return new Map()
}
