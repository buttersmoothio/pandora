import { Memory } from '@mastra/memory'
import { type Config, DEFAULT_WORKING_MEMORY_TEMPLATE } from './config'
import { getLogger } from './logger'

const workingMemoryConfig = { enabled: true, template: DEFAULT_WORKING_MEMORY_TEMPLATE } as const

/**
 * Create a Memory instance configured from Pandora config.
 *
 * When memory is enabled, uses both Observational Memory (resource scope)
 * and Working Memory for cross-thread persistent context. The Observer/Reflector
 * model defaults to the operator's model unless explicitly overridden in config.
 */
export function createMemory(config: Config): Memory {
  const log = getLogger()

  if (!config.memory.enabled) {
    log.debug('[memory] disabled')
    return new Memory({ options: { generateTitle: true } })
  }

  const model =
    config.memory.model ?? `${config.models.operator.provider}/${config.models.operator.model}`

  log.debug('[memory] enabled', { model, scope: 'resource' })

  return new Memory({
    options: {
      generateTitle: true,
      observationalMemory: {
        model,
        scope: 'resource',
      },
      workingMemory: workingMemoryConfig,
    },
  })
}
