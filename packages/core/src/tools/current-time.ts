import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export function createCurrentTimeTool(timezone: string) {
  return createTool({
    id: 'current_time',
    description: 'Get the current date and time',
    inputSchema: z.object({}),
    execute: async () => {
      const now = new Date()
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(now)
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now)
      const time = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(now)
      const day = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
      }).format(now)

      return { iso: now.toISOString(), formatted, date, time, day, timezone }
    },
  })
}
