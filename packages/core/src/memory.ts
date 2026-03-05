import { Memory } from '@mastra/memory'
import type { Config } from './config'
import { getLogger } from './logger'

/**
 * Create a Memory instance configured from Pandora config.
 *
 * When memory is enabled, uses Observational Memory with resource scope
 * for cross-thread persistent memory. The Observer/Reflector model defaults
 * to the operator's model unless explicitly overridden in config.
 */
export function createMemory(config: Config) {
  const log = getLogger()

  if (!config.memory.enabled) {
    log.debug('Memory: observational memory disabled')
    return new Memory({ options: { generateTitle: true } })
  }

  const model =
    config.memory.model ?? `${config.models.operator.provider}/${config.models.operator.model}`

  log.debug('Memory: observational memory enabled', { model, scope: 'resource' })

  return new Memory({
    options: {
      generateTitle: true,
      observationalMemory: {
        model,
        scope: 'resource',
      },
    },
  })
}
