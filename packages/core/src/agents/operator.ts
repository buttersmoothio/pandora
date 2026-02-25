import { Agent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import type { Config } from '../config'
import { resolveModel } from '../mastra/models'
import type { ToolRecord } from '../tools'
import type { AgentRecord } from './types'

/**
 * Build the system instructions from identity + personality config.
 */
function buildInstructions(config: Config): string {
  return `You are ${config.identity.name}.\n\n${config.personality.systemPrompt}`
}

/**
 * Create the main operator agent from config.
 *
 * When `subagents` is provided (even if empty), the operator can be used
 * with `.network()` for routing to specialist agents.
 */
export function createOperator(
  config: Config,
  tools: ToolRecord,
  memory: MastraMemory,
  subagents?: AgentRecord,
): Agent {
  return new Agent({
    id: 'operator',
    name: config.identity.name,
    description: 'Routes user requests to the appropriate specialist or handles them directly.',
    instructions: buildInstructions(config),
    model: resolveModel(config, 'operator'),
    tools,
    memory,
    agents: subagents ?? {},
  })
}
