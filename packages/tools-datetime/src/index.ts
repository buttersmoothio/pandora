import type { ToolPackagePlugin } from '@pandora/core/tools'
import { currentTime } from './current-time'

export default {
  id: 'tools-datetime',
  schemaVersion: 1,
  factory: (_env) => ({ 'current-time': currentTime }),
} satisfies ToolPackagePlugin
