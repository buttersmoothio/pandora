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
 * Load built-in tools that are enabled in config.
 */
export function loadBuiltinTools(
  config: Config,
  _envVars: Record<string, string | undefined>,
): ToolRecord {
  const result: ToolRecord = {}

  for (const [id, tool] of Object.entries(ALL_BUILTIN_TOOLS)) {
    if (config.tools[id]?.enabled) {
      result[id] = tool
    }
  }

  return result
}
