import { Agent as MastraAgent } from '@mastra/core/agent'
import type { MastraMemory } from '@mastra/core/memory'
import type { Config } from '../config'
import { getLogger } from '../logger'
import { resolveModel } from '../models'
import type { ToolRecord } from '../tools/types'

type AgentRecord = Record<string, MastraAgent>

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
 * Subagents are delegated to automatically via the supervisor pattern.
 */
export function createOperator(
  config: Config,
  tools: ToolRecord,
  memory: MastraMemory,
  subagents?: AgentRecord,
): MastraAgent {
  getLogger().debug('Operator agent created', {
    tools: Object.keys(tools).length,
    subagents: Object.keys(subagents ?? {}).length,
  })

  return new MastraAgent({
    id: 'operator',
    name: config.identity.name,
    description: 'The main assistant. Handles any request that specialist agents cannot.',
    instructions: buildInstructions(config),
    model: resolveModel(config, 'operator'),
    tools,
    memory,
    agents: subagents ?? {},
  })
}
