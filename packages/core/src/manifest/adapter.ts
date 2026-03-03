import type { Agent, AgentManifest } from '@pandorakit/sdk/agents'
import type { ChannelFactory } from '@pandorakit/sdk/channels'
import type {
  ResolveToolsContext,
  ResolveToolsResult,
  Tool,
  ToolManifest,
} from '@pandorakit/sdk/tools'
import type { RegisteredPlugin } from '../runtime/plugin-registry'
import { buildSchemaFromFields } from '../runtime/plugin-types'
import { buildManifest } from '../tools/define'
import type { LoadedEntry } from './loader'
import type { AgentProvidesEntry, PluginManifest, ProvidesEntry } from './schema'

// -- Type guards for plugin namespace exports --

function isToolArray(v: unknown): v is Tool[] {
  return (
    Array.isArray(v) &&
    v.every((t) => typeof t === 'object' && t !== null && 'id' in t && 'execute' in t)
  )
}

function isResolveToolsFn(
  v: unknown,
): v is (ctx: ResolveToolsContext) => Promise<ResolveToolsResult> {
  return typeof v === 'function'
}

function isAgent(v: unknown): v is Agent {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'name' in v &&
    'description' in v &&
    'instructions' in v
  )
}

function isChannelFactory(v: unknown): v is ChannelFactory {
  return typeof v === 'function'
}

// -- Adapters --

function adaptTools(entry: ProvidesEntry, ns: Record<string, unknown>): RegisteredPlugin['tools'] {
  const tools = isToolArray(ns.tools) ? ns.tools : []
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
    resolveTools: isResolveToolsFn(ns.resolveTools) ? ns.resolveTools : undefined,
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
  if (!isAgent(ns.agent)) return null
  const agentDef = ns.agent
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

function adaptChannels(ns: Record<string, unknown>): RegisteredPlugin['channels'] | undefined {
  if (!isChannelFactory(ns.factory)) return undefined
  return { factory: ns.factory }
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
