import { describe, expect, it, vi } from 'vitest'
import type { Config } from '../config'
import { DEFAULTS } from '../config'
import { loadBuiltinTools } from '../tools/builtin'

// Mock the Agent constructor to capture config
const mockAgentConstructor = vi.fn()
vi.mock('@mastra/core/agent', () => ({
  Agent: class MockAgent {
    id: string
    name: string
    constructor(config: Record<string, unknown>) {
      mockAgentConstructor(config)
      this.id = config.id as string
      this.name = config.name as string
    }
  },
}))

// Import after mock is set up
const { createOperator } = await import('./operator')

describe('createOperator', () => {
  it('creates agent with correct id', () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    const agent = createOperator(DEFAULTS, tools)
    expect(agent.id).toBe('operator')
  })

  it('uses identity name as agent name', () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    const agent = createOperator(DEFAULTS, tools)
    expect(agent.name).toBe('Pandora')
  })

  it('builds instructions from identity and personality', () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    createOperator(DEFAULTS, tools)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.instructions).toContain('Pandora')
    expect(config.instructions).toContain('A multi-channel AI assistant')
    expect(config.instructions).toContain('helpful, concise, friendly')
  })

  it('includes custom system prompt in instructions', () => {
    const config: Config = {
      ...DEFAULTS,
      personality: {
        ...DEFAULTS.personality,
        systemPrompt: 'Always respond in haiku.',
      },
    }
    const tools = loadBuiltinTools(DEFAULTS, {})
    createOperator(config, tools)

    const agentConfig = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(agentConfig.instructions).toContain('Always respond in haiku.')
  })

  it('passes tools to agent', () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    createOperator(DEFAULTS, tools)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).toBe(tools)
  })

  it('uses default model string', () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    createOperator(DEFAULTS, tools)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.model).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('uses custom model when configured', () => {
    const customConfig: Config = {
      ...DEFAULTS,
      models: {
        ...DEFAULTS.models,
        operator: { provider: 'openai', model: 'gpt-4o' },
      },
    }
    const tools = loadBuiltinTools(DEFAULTS, {})
    createOperator(customConfig, tools)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.model).toBe('openai/gpt-4o')
  })
})
