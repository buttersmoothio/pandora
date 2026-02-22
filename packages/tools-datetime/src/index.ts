import type { ToolPlugin } from '@pandora/core/tools'
import { currentTime } from './current-time'

export default {
  id: 'tools-datetime',
  name: 'Date & Time',
  schemaVersion: 1,
  factory: (env, config) => ({ 'current-time': currentTime(env, config) }),
} satisfies ToolPlugin
