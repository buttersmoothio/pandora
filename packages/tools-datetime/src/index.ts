import type { ToolPackageFactory } from '@pandora/core/tools'
import { currentTime } from './current-time'

export const createTools: ToolPackageFactory = (_env) => ({
  'current-time': currentTime,
})
