import type { AgentPlugin } from '../agents/types'
import type { ChannelPlugin } from '../channels/types'
import { PLUGIN_SCHEMA_VERSION } from '../plugin-types'
import type { StoragePlugin } from '../storage'
import type { ToolExport, ToolPlugin } from '../tools/types'
import type { VectorPlugin } from '../vector'
import type { LoadedEntry } from './loader'
import type { PluginManifest } from './schema'

export interface AdaptedPlugins {
  tools: ToolPlugin[]
  agents: AgentPlugin[]
  channels: ChannelPlugin[]
  storage: StoragePlugin[]
  vector: VectorPlugin[]
}

function baseFields(manifest: PluginManifest) {
  return {
    id: manifest.id,
    name: manifest.name,
    schemaVersion: PLUGIN_SCHEMA_VERSION,
    envVars: manifest.envVars,
    configFields: manifest.configFields,
  }
}

/**
 * Convert loaded manifest entries into plugin interface objects.
 *
 * Export contracts per capability:
 * - tools: `export const tools`, `export function getTools`
 * - agents: `export const agent` — each entry is one agent, collected into one AgentPlugin
 * - channels: `export const factory`
 * - storage: `export const factory`
 * - vector: `export const factory`
 *
 * All tools are `ToolExport` objects — wrapping into Mastra tools happens at load time.
 */
export function adaptManifest(manifest: PluginManifest, entries: LoadedEntry[]): AdaptedPlugins {
  const result: AdaptedPlugins = {
    tools: [],
    agents: [],
    channels: [],
    storage: [],
    vector: [],
  }

  const agentDefs: AgentPlugin['agents'] = []

  for (const { key, namespace: ns } of entries) {
    const base = baseFields(manifest)

    switch (key) {
      case 'tools':
        result.tools.push({
          ...base,
          tools: (ns.tools ?? []) as ToolExport[],
          getTools: ns.getTools as ToolPlugin['getTools'],
        })
        break

      case 'agents':
        if (ns.agent) {
          agentDefs.push(ns.agent as AgentPlugin['agents'][number])
        }
        break

      case 'channels':
        result.channels.push({
          ...base,
          factory: ns.factory as ChannelPlugin['factory'],
        })
        break

      case 'storage':
        result.storage.push({
          ...base,
          factory: ns.factory as StoragePlugin['factory'],
        })
        break

      case 'vector':
        result.vector.push({
          ...base,
          factory: ns.factory as VectorPlugin['factory'],
        })
        break
    }
  }

  if (agentDefs.length > 0) {
    result.agents.push({
      ...baseFields(manifest),
      agents: agentDefs,
    })
  }

  return result
}
