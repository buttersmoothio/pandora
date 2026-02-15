import { Agent } from '@mastra/core/agent'
import type { Config } from '../config'
import { resolveModel } from '../mastra/models'
import type { ToolRecord } from '../tools'

/**
 * Build the system instructions from identity + personality config.
 */
function buildInstructions(config: Config): string {
  const { identity, personality } = config
  const lines: string[] = []

  lines.push(`You are ${identity.name}: ${identity.description}`)

  if (personality.traits.length > 0) {
    lines.push(`Your personality traits: ${personality.traits.join(', ')}.`)
  }

  if (personality.systemPrompt) {
    lines.push(personality.systemPrompt)
  }

  return lines.join('\n\n')
}

/**
 * Create the main operator agent from config.
 */
export function createOperator(config: Config, tools: ToolRecord): Agent {
  return new Agent({
    id: 'operator',
    name: config.identity.name,
    instructions: buildInstructions(config),
    model: resolveModel(config, 'default'),
    tools,
  })
}
