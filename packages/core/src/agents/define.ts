import type { ToolDefinition } from '../tools/define'
import type { AgentManifest } from './types'

// --- Manifest registry ---

const manifestRegistry = new Map<string, AgentManifest>()

/** Retrieve the Pandora manifest for an agent by ID. */
export function getAgentManifest(agentOrId: string | { id: string }): AgentManifest | undefined {
  const id = typeof agentOrId === 'string' ? agentOrId : agentOrId.id
  return manifestRegistry.get(id)
}

/** Return all registered agent manifests keyed by agent ID. */
export function getAllAgentManifests(): Record<string, AgentManifest> {
  return Object.fromEntries(manifestRegistry)
}

/** Clear the agent manifest registry. Useful for testing. */
export function clearAgentManifestRegistry(): void {
  manifestRegistry.clear()
}

// --- AgentDefinition ---

/**
 * An agent definition returned by `defineAgent`.
 *
 * The `id` property is available immediately for manifest lookups.
 * Agent instances are created by `loadAgents()` using the manifest metadata.
 */
export interface AgentDefinition {
  readonly id: string
  readonly tools: readonly ToolDefinition[]
}

// --- defineAgent ---

export interface DefineAgentOptions {
  /** Unique agent identifier. */
  id: string
  /** Human-readable display name. */
  name: string
  /** What the agent does (shown to the router). */
  description: string
  /** System instructions for the agent. */
  instructions: string
  /** Scoped tools available to this agent. */
  tools?: ToolDefinition[]
}

/**
 * Define a Pandora subagent with a metadata manifest.
 *
 * Registers the manifest immediately and returns an `AgentDefinition`
 * with an `id` property for immediate access.
 *
 * Agent instances are created by `loadAgents()` which resolves
 * the model, memory, and scoped tools from config.
 */
export function defineAgent(opts: DefineAgentOptions): AgentDefinition {
  const manifest: AgentManifest = {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    instructions: opts.instructions,
  }

  manifestRegistry.set(opts.id, manifest)

  return { id: opts.id, tools: opts.tools ?? [] }
}
