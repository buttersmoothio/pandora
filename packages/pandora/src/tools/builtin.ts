import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { Config } from '../config'
import type { ToolRecord } from './types'

/** All available built-in tools */
const ALL_BUILTIN_TOOLS = {
  'current-time': createTool({
    id: 'current-time',
    description: 'Get the current date and time in ISO 8601 format',
    inputSchema: z.object({
      timezone: z
        .string()
        .optional()
        .describe('IANA timezone (e.g. "America/New_York"). Defaults to UTC.'),
    }),
    execute: async (input) => {
      const requested = input.timezone ?? 'UTC'
      const now = new Date()
      try {
        // Validate timezone by constructing a formatter (throws for invalid zones)
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: requested })
        return {
          iso: now.toISOString(),
          formatted: fmt.format(now),
          timezone: requested,
        }
      } catch {
        return {
          iso: now.toISOString(),
          formatted: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(now),
          timezone: 'UTC',
        }
      }
    },
  }),
} as const

/**
 * Load Tier 1 built-in tools, filtered by config.tools.enabled / config.tools.disabled.
 *
 * - If `enabled` is non-empty, only those tools are included.
 * - If `disabled` is non-empty, those tools are excluded.
 * - If both are empty, all built-in tools are included.
 */
export function loadBuiltinTools(
  config: Config,
  _envVars: Record<string, string | undefined>,
): ToolRecord {
  const { enabled, disabled } = config.tools
  const result: ToolRecord = {}

  for (const [id, tool] of Object.entries(ALL_BUILTIN_TOOLS)) {
    // If enabled list is set, only include tools in that list
    if (enabled.length > 0 && !enabled.includes(id)) continue
    // If disabled list is set, exclude tools in that list
    if (disabled.includes(id)) continue
    result[id] = tool
  }

  return result
}
