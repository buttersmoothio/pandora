import type { HeartbeatCheck, HeartbeatConfig, ScheduledTask } from '../config'

export const HEARTBEAT_TASK_ID = '__heartbeat__'

/**
 * Check whether the current time falls within the configured active hours window.
 * Returns `true` if no active hours are configured (always active).
 */
export function isWithinActiveHours(
  activeHours: { start: string; end: string } | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!activeHours) {
    return true
  }
  const currentTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  const { start, end } = activeHours
  if (start <= end) {
    return currentTime >= start && currentTime < end
  }
  // Overnight range (e.g. 22:00 - 06:00)
  return currentTime >= start || currentTime < end
}

/**
 * Convert heartbeat config to a synthetic ScheduledTask for the scheduler.
 */
export function createHeartbeatTask(heartbeat: HeartbeatConfig): ScheduledTask {
  return {
    id: HEARTBEAT_TASK_ID,
    name: 'Heartbeat',
    cron: heartbeat.cron,
    prompt: 'heartbeat',
    enabled: heartbeat.enabled,
    destination: heartbeat.destination,
  }
}

/**
 * Build the heartbeat prompt from enabled check items.
 * Returns an empty string if there are no enabled tasks.
 */
export function buildHeartbeatPrompt(tasks: HeartbeatCheck[]): string {
  const enabled = tasks.filter((t) => t.enabled)
  if (enabled.length === 0) {
    return ''
  }

  const checklist = enabled.map((t, i) => `${i + 1}. ${t.description}`).join('\n')

  return `You are running a periodic heartbeat check. Evaluate the following checklist and determine if anything needs the user's attention.

## Checklist

${checklist}

## Instructions

- Evaluate each item using your available tools.
- If something needs the user's attention, send a notification using the \`send_to\` tool with a clear subject and details.
- If nothing needs attention, do nothing — no response is needed.
- Be concise. Only alert on genuinely important or time-sensitive items.`
}
