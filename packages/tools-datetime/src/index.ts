import type { ToolPlugin } from '@pandora/core/tools'
import { currentTime } from './current-time'

export default {
  id: 'tools-datetime',
  name: 'Date & Time',
  schemaVersion: 1,
  tools: [currentTime],
} satisfies ToolPlugin
