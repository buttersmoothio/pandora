import type { MastraMemory } from '@mastra/core/memory'
import type { Disk } from 'flydrive'
import { describe, expect, it, vi } from 'vitest'
import type { Config } from '../../config'
import { DEFAULTS } from '../../config'

// Mock the Agent constructor to capture config
const mockAgentConstructor: ReturnType<typeof vi.fn> = vi.fn()
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
// biome-ignore lint/nursery/useExplicitType: dynamic import type is inferred
const { createOperator } = await import('../operator')

const mockMemory = {} as MastraMemory
const mockDisk = {} as Disk
const mockBaseUrl = 'http://localhost:4111'
const emptyTools = {}

describe('createOperator', () => {
  it('creates agent with correct id', () => {
    const agent = createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)
    expect(agent.id).toBe('operator')
  })

  it('uses identity name as agent name', () => {
    const agent = createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)
    expect(agent.name).toBe('Pandora')
  })

  it('builds instructions from identity name and system prompt', () => {
    createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.instructions).toContain('You are Pandora.')
    expect(config.instructions).toContain('# Who You Are')
  })

  it('includes custom system prompt in instructions', () => {
    const config: Config = {
      ...DEFAULTS,
      personality: {
        systemPrompt: 'Always respond in haiku.',
      },
    }
    createOperator(config, emptyTools, mockMemory, mockDisk, mockBaseUrl)

    const agentConfig = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(agentConfig.instructions).toContain('You are Pandora.')
    expect(agentConfig.instructions).toContain('Always respond in haiku.')
  })

  it('passes tools to agent', () => {
    const tools = { 'my-tool': {} as never }
    createOperator(DEFAULTS, tools, mockMemory, mockDisk, mockBaseUrl)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).toBe(tools)
  })

  it('passes memory to agent', () => {
    createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.memory).toBe(mockMemory)
  })

  it('uses default model string', () => {
    createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)

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
    createOperator(customConfig, emptyTools, mockMemory, mockDisk, mockBaseUrl)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.model).toBe('openai/gpt-4o')
  })

  it('passes subagents to agent constructor', () => {
    const subagents = { helper: { id: 'helper' } as never }
    createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl, subagents)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.agents).toBe(subagents)
  })

  it('defaults agents to empty object when no subagents provided', () => {
    createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.agents).toEqual({})
  })

  it('sets description on operator agent', () => {
    createOperator(DEFAULTS, emptyTools, mockMemory, mockDisk, mockBaseUrl)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.description).toBeDefined()
    expect(config.description.length).toBeGreaterThan(0)
  })
})
