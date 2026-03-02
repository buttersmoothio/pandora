import type { Agent, AgentManifest } from '@pandorakit/sdk/agents'
import type { Tool, ToolManifest } from '@pandorakit/sdk/tools'
import type { RegisteredPlugin } from '../runtime/plugin-registry'
import { buildSchemaFromFields } from '../runtime/plugin-types'
import { buildManifest } from '../tools/define'
import type { LoadedEntry } from './loader'
import type { AgentProvidesEntry, PluginManifest, ProvidesEntry } from './schema'

function adaptTools(entry: ProvidesEntry, ns: Record<string, unknown>): RegisteredPlugin['tools'] {
  const tools = (ns.tools ?? []) as Tool[]
  for (const t of tools) {
    t.sandbox = entry.sandbox
    t.permissions = entry.permissions
  }
  const manifests = new Map<string, ToolManifest>()
  for (const t of tools) {
    manifests.set(t.id, buildManifest(t))
  }
  return {
    entries: tools,
    resolveTools: ns.resolveTools as RegisteredPlugin['tools'] extends infer T
      ? T extends { resolveTools?: infer R }
        ? R
        : never
      : never,
    manifests,
    sandbox: entry.sandbox,
    permissions: entry.permissions,
    requireApproval: entry.requireApproval,
  }
}

function adaptAgent(
  entry: AgentProvidesEntry,
  ns: Record<string, unknown>,
): { def: Agent; manifest: AgentManifest } | null {
  if (!ns.agent) return null
  const agentDef = ns.agent as Agent
  agentDef.useTools = entry.useTools ?? []
  agentDef.modelTools = entry.modelTools ?? []
  return {
    def: agentDef,
    manifest: {
      id: agentDef.id,
      name: agentDef.name,
      description: agentDef.description,
      instructions: agentDef.instructions,
    },
  }
}

function adaptChannels(ns: Record<string, unknown>): RegisteredPlugin['channels'] {
  return {
    factory: ns.factory as RegisteredPlugin['channels'] extends infer T
      ? T extends { factory: infer F }
        ? F
        : never
      : never,
  }
}

/**
 * Convert loaded manifest entries into a single RegisteredPlugin.
 *
 * Export contracts per capability:
 * - tools: `export const tools`, `export function resolveTools`
 * - agents: `export const agent` — each entry is one agent, collected into one plugin
 * - channels: `export const factory`
 */
export function adaptManifest(manifest: PluginManifest, entries: LoadedEntry[]): RegisteredPlugin {
  const plugin: RegisteredPlugin = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    icon: manifest.icon,
    version: manifest.version,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    envVars: manifest.envVars ?? [],
    configFields: manifest.configFields ?? [],
    schema: manifest.configFields?.length
      ? buildSchemaFromFields(manifest.configFields)
      : undefined,
  }

  const agentDefs: Agent[] = []
  const agentManifests = new Map<string, AgentManifest>()

  for (const { key, entry, namespace: ns } of entries) {
    switch (key) {
      case 'tools':
        plugin.tools = adaptTools(entry, ns)
        break
      case 'agents': {
        const result = adaptAgent(entry as AgentProvidesEntry, ns)
        if (result) {
          agentManifests.set(result.def.id, result.manifest)
          agentDefs.push(result.def)
        }
        break
      }
      case 'channels':
        plugin.channels = adaptChannels(ns)
        break
    }
  }

  if (agentDefs.length > 0) {
    plugin.agents = {
      definitions: agentDefs,
      manifests: agentManifests,
    }
  }

  return plugin
}
