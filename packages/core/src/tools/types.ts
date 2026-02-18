import type { Tool } from '@mastra/core/tools'

/**
 * Permission levels for tool execution
 */
export interface ToolPermissions {
  /** Whether the tool requires explicit user approval before execution */
  requireApproval: boolean
  /** Allowed channels (empty = all channels) */
  allowedChannels: string[]
}

/**
 * Record of a generated (Tier 2) tool stored in the database.
 * Deferred — placeholder for future implementation.
 */
export interface GeneratedToolRecord {
  id: string
  name: string
  description: string
  /** Zod schema source as serialized string */
  inputSchema: string
  /** Tool implementation source code (executed in SES Compartment) */
  code: string
  permissions: ToolPermissions
  createdAt: string
  updatedAt: string
}

/** A record of tool instances keyed by tool ID */
// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
export type ToolRecord = Record<string, Tool<any, any, any, any, any, any>>
