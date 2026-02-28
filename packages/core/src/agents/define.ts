import type { AgentManifest } from './types'

// --- Manifest registry ---

const manifestRegistry = new Map<string, AgentManifest>()

/** Register an agent manifest. Called by the adapter when processing agent entries. */
export function registerAgentManifest(manifest: AgentManifest): void {
  manifestRegistry.set(manifest.id, manifest)
}

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
 * A plain agent definition exported from agent entry points.
 *
 * Agent entry points export `export const agent: AgentDefinition = { ... }`.
 * Agent instances are created by `loadAgents()` using the manifest metadata.
 */
export interface AgentDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  /** Tool IDs to pull from the global tool registry — stamped by the adapter from the manifest. */
  useTools?: string[]
  /** Model-native tool keys (e.g. 'search') — stamped by the adapter from the manifest. */
  modelTools?: string[]
}
