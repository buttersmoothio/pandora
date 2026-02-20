import { Agent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import type { Config } from '../config'
import { resolveModel } from '../mastra/models'
import type { ToolRecord } from '../tools'

/**
 * Build the system instructions from identity + personality config.
 */
function buildInstructions(config: Config): string {
  return `You are ${config.identity.name}.\n\n${config.personality.systemPrompt}`
}

/**
 * Create the main operator agent from config.
 */
export function createOperator(config: Config, tools: ToolRecord, memory: MastraMemory): Agent {
  return new Agent({
    id: 'operator',
    name: config.identity.name,
    instructions: buildInstructions(config),
    model: resolveModel(config, 'operator'),
    tools,
    memory,
  })
}
