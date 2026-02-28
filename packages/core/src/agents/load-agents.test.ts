import type { MastraMemory } from '@mastra/core/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../config'
import type { AgentPlugin } from './types'

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

// Mock model-tools to avoid dynamic imports of provider SDKs
vi.mock('./model-tools', () => ({
  resolveModelTools: vi.fn(async () => ({ tools: {}, alerts: [] })),
}))

const { registerAgentManifest } = await import('./define')
const { registerAgentPlugin, loadAgents, clearAgentPlugins, getAgentAlerts } = await import(
  './index'
)
const { resolveModelTools } = await import('./model-tools')
const mockResolveModelTools = vi.mocked(resolveModelTools)

const mockMemory = {} as MastraMemory

function makeAgentDef(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? 'test-agent'
  const def = {
    id,
    name: (overrides.name as string) ?? 'Test Agent',
    description: (overrides.description as string) ?? 'A test agent',
    instructions: (overrides.instructions as string) ?? 'Do things',
    useTools: (overrides.useTools as string[]) ?? [],
    modelTools: (overrides.modelTools as string[]) ?? [],
  }
  // Register the manifest (normally done by the adapter)
  registerAgentManifest({
    id: def.id,
    name: def.name,
    description: def.description,
    instructions: def.instructions,
  })
  return def
}

function makePlugin(agents: ReturnType<typeof makeAgentDef>[]): AgentPlugin {
  return {
    id: 'test-plugin',
    name: 'Test',
    schemaVersion: 1,
    agents,
  }
}

describe('loadAgents with plain object agents', () => {
  afterEach(() => {
    clearAgentPlugins()
    mockAgentConstructor.mockClear()
    mockResolveModelTools.mockClear()
  })

  it('loads agent from plain object definition', async () => {
    const agent = makeAgentDef({
      id: 'static-agent',
      name: 'Static',
      description: 'A static agent',
      instructions: 'Do things',
    })
    registerAgentPlugin(makePlugin([agent]))

    const result = await loadAgents(DEFAULTS, mockMemory)

    expect(result['static-agent']).toBeDefined()
    expect(result['static-agent'].id).toBe('static-agent')
  })

  it('inherits tools from global tool registry via useTools', async () => {
    const globalTools = { web_search: { type: 'tool' } as never }
    const agent = makeAgentDef({
      id: 'search-agent',
      name: 'Search',
      description: 'Agent with useTools',
      instructions: 'Search',
      useTools: ['web_search'],
    })
    registerAgentPlugin(makePlugin([agent]))

    await loadAgents(DEFAULTS, mockMemory, globalTools)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).toHaveProperty('web_search')
  })

  it('skips unavailable useTools gracefully', async () => {
    const globalTools = {}
    const agent = makeAgentDef({
      id: 'missing-tool-agent',
      name: 'Missing',
      description: 'Agent with missing useTools',
      instructions: 'Search',
      useTools: ['nonexistent_tool'],
    })
    registerAgentPlugin(makePlugin([agent]))

    const result = await loadAgents(DEFAULTS, mockMemory, globalTools)

    expect(result['missing-tool-agent']).toBeDefined()
    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).not.toHaveProperty('nonexistent_tool')
  })

  it('resolves modelTools when nativeModelTools is enabled', async () => {
    mockResolveModelTools.mockResolvedValue({
      tools: { web_search: { type: 'native-search' } as never },
      alerts: [{ level: 'info', message: 'Using Anthropic native search' }],
    })

    const agent = makeAgentDef({
      id: 'model-tool-agent',
      name: 'ModelTool',
      description: 'Agent with modelTools',
      instructions: 'Search',
      modelTools: ['search'],
    })
    registerAgentPlugin(makePlugin([agent]))

    await loadAgents(DEFAULTS, mockMemory)

    expect(mockResolveModelTools).toHaveBeenCalledOnce()
    expect(mockResolveModelTools).toHaveBeenCalledWith('anthropic/claude-sonnet-4-20250514', [
      'search',
    ])

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).toHaveProperty('web_search')
    expect(getAgentAlerts('model-tool-agent')).toEqual([
      { level: 'info', message: 'Using Anthropic native search' },
    ])
  })

  it('skips modelTools when nativeModelTools is false', async () => {
    const agent = makeAgentDef({
      id: 'no-native-agent',
      name: 'NoNative',
      description: 'Agent with modelTools but disabled',
      instructions: 'Search',
      modelTools: ['search'],
    })
    registerAgentPlugin(makePlugin([agent]))

    const config = { ...DEFAULTS, nativeModelTools: false }
    await loadAgents(config, mockMemory)

    expect(mockResolveModelTools).not.toHaveBeenCalled()
  })

  it('loads multiple agents from the same plugin', async () => {
    const agentA = makeAgentDef({
      id: 'agent-a',
      name: 'A',
      description: 'First',
      instructions: 'A',
    })
    const agentB = makeAgentDef({
      id: 'agent-b',
      name: 'B',
      description: 'Second',
      instructions: 'B',
    })
    registerAgentPlugin(makePlugin([agentA, agentB]))

    const result = await loadAgents(DEFAULTS, mockMemory)

    expect(result['agent-a']).toBeDefined()
    expect(result['agent-b']).toBeDefined()
  })

  it('respects agent disabled config', async () => {
    const agent = makeAgentDef({
      id: 'disabled-agent',
      name: 'Disabled',
      description: 'Disabled',
      instructions: 'Nothing',
    })
    registerAgentPlugin(makePlugin([agent]))

    const config = {
      ...DEFAULTS,
      agents: { 'disabled-agent': { enabled: false } },
    }
    const result = await loadAgents(config, mockMemory)

    expect(result['disabled-agent']).toBeUndefined()
  })

  it('uses agent-specific model override for modelTools resolution', async () => {
    mockResolveModelTools.mockResolvedValue({ tools: {}, alerts: [] })

    const agent = makeAgentDef({
      id: 'model-override-agent',
      name: 'ModelOverride',
      description: 'Agent with model override',
      instructions: 'Search',
      modelTools: ['search'],
    })
    registerAgentPlugin(makePlugin([agent]))

    const config = {
      ...DEFAULTS,
      agents: {
        'model-override-agent': {
          enabled: true,
          model: { provider: 'openai', model: 'gpt-4o' },
        },
      },
    }

    await loadAgents(config, mockMemory)

    expect(mockResolveModelTools).toHaveBeenCalledWith('openai/gpt-4o', ['search'])
  })
})
