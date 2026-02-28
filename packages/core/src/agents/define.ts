/**
 * A plain agent definition exported from agent entry points.
 *
 * Agent entry points export `export const agent: AgentDefinition = { ... }`.
 * Agent instances are created by the runtime using the manifest metadata.
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
