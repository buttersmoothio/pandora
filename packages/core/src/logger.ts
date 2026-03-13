import { ConsoleLogger, type LogLevel } from '@mastra/core/logger'

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set<LogLevel>(['error', 'warn', 'info', 'debug'])

let _cached: ConsoleLogger | null = null

export function getLogger(env?: Record<string, string | undefined>): ConsoleLogger {
  if (_cached) {
    return _cached
  }

  const raw = env?.LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'error'
  const level: LogLevel = VALID_LOG_LEVELS.has(raw) ? (raw as LogLevel) : 'error'
  _cached = new ConsoleLogger({ name: 'pandora', level })
  return _cached
}
