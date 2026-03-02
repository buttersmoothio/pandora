import type { ToolExport } from '@pandorakit/core/tools'

interface TimeInput {
  timezone?: string
}

interface TimeResult {
  iso: string
  formatted: string
  timezone: string
}

export const currentTime: ToolExport<TimeInput, TimeResult> = {
  id: 'current-time',
  name: 'Current Time',
  description: 'Get the current date and time in ISO 8601 format',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA timezone (e.g. "America/New_York"). Defaults to UTC.',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  execute: async (input, context) => {
    const requested = input.timezone ?? 'UTC'
    const now = new Date()
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: requested })
      return {
        iso: now.toISOString(),
        formatted: fmt.format(now),
        timezone: requested,
      }
    } catch {
      context.logger.warn(`Invalid timezone "${requested}", falling back to UTC`)
      return {
        iso: now.toISOString(),
        formatted: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(now),
        timezone: 'UTC',
      }
    }
  },
}
