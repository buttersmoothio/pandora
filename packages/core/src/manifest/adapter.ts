import type { AgentDefinition } from '../agents/define'
import type { AgentManifest } from '../agents/types'
import { buildSchemaFromFields } from '../plugin-types'
import type { RegisteredPlugin } from '../runtime/plugin-registry'
import { buildManifest } from '../tools/define'
import type { ToolExport, ToolManifest } from '../tools/types'
import type { LoadedEntry } from './loader'
import type { AgentProvidesEntry, PluginManifest } from './schema'

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

  const agentDefs: AgentDefinition[] = []
  const agentManifests = new Map<string, AgentManifest>()

  for (const { key, entry, namespace: ns } of entries) {
    switch (key) {
      case 'tools': {
        const tools = (ns.tools ?? []) as ToolExport[]
        for (const t of tools) {
          t.sandbox = entry.sandbox
          t.permissions = entry.permissions
        }
        const manifests = new Map<string, ToolManifest>()
        for (const t of tools) {
          manifests.set(t.id, buildManifest(t))
        }
        plugin.tools = {
          entries: tools,
          resolveTools: ns.resolveTools as RegisteredPlugin['tools'] extends infer T
            ? T extends { resolveTools?: infer R }
              ? R
              : never
            : never,
          manifests,
          sandbox: entry.sandbox,
          permissions: entry.permissions,
        }
        break
      }

      case 'agents':
        if (ns.agent) {
          const agentDef = ns.agent as AgentDefinition
          const agentManifest: AgentManifest = {
            id: agentDef.id,
            name: agentDef.name,
            description: agentDef.description,
            instructions: agentDef.instructions,
          }
          agentManifests.set(agentDef.id, agentManifest)
          // Stamp manifest-declared deps from the provides entry
          agentDef.useTools = (entry as AgentProvidesEntry).useTools ?? []
          agentDef.modelTools = (entry as AgentProvidesEntry).modelTools ?? []
          agentDefs.push(agentDef)
        }
        break

      case 'channels':
        plugin.channels = {
          factory: ns.factory as RegisteredPlugin['channels'] extends infer T
            ? T extends { factory: infer F }
              ? F
              : never
            : never,
        }
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
