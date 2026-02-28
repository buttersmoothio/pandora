import { ConsoleLogger, type LogLevel } from '@mastra/core/logger'

let _cached: ConsoleLogger | null = null

export function getLogger(env?: Record<string, string | undefined>) {
  if (_cached) return _cached

  const level = (env?.LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') as LogLevel
  _cached = new ConsoleLogger({ name: 'pandora', level })
  return _cached
}
