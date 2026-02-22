import type { ToolPlugin } from '@pandora/core/tools'
import { currentTime } from './current-time'

export default {
  id: 'tools-datetime',
  name: 'Date & Time',
  schemaVersion: 1,
  envVars: [],
  factory: (_env) => ({ 'current-time': currentTime }),
} satisfies ToolPlugin
