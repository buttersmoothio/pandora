import { defineTool } from '@pandora/core/tools'
import { z } from 'zod'

export const currentTime = defineTool({
  id: 'current-time',
  name: 'Current Time',
  description: 'Get the current date and time in ISO 8601 format',
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone (e.g. "America/New_York"). Defaults to UTC.'),
  }),
  sandbox: 'host',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
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
})
