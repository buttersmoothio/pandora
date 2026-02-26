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

const { defineAgent } = await import('./define')
const { registerAgentPlugin, loadAgents, clearAgentPlugins, getAgentAlerts } = await import(
  './index'
)

const mockMemory = {} as MastraMemory

function makePlugin(agents: ReturnType<typeof defineAgent>[]): AgentPlugin {
  return {
    id: 'test-plugin',
    name: 'Test',
    schemaVersion: 1,
    agents,
  }
}

describe('loadAgents with getTools', () => {
  afterEach(() => {
    clearAgentPlugins()
    mockAgentConstructor.mockClear()
  })

  it('loads agent without getTools (static tools only)', async () => {
    const agent = defineAgent({
      id: 'static-agent',
      name: 'Static',
      description: 'A static agent',
      instructions: 'Do things',
    })
    registerAgentPlugin(makePlugin([agent]))

    const result = await loadAgents(DEFAULTS, {}, mockMemory)

    expect(result['static-agent']).toBeDefined()
    expect(result['static-agent'].id).toBe('static-agent')
  })

  it('merges dynamic tools from getTools into agent', async () => {
    const dynamicTool = { fake: 'tool' }
    const agent = defineAgent({
      id: 'dynamic-agent',
      name: 'Dynamic',
      description: 'An agent with dynamic tools',
      instructions: 'Search things',
      async getTools() {
        return { myTool: dynamicTool }
      },
    })
    registerAgentPlugin(makePlugin([agent]))

    await loadAgents(DEFAULTS, {}, mockMemory)

    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).toHaveProperty('myTool', dynamicTool)
  })

  it('skips agent when getTools returns null', async () => {
    const agent = defineAgent({
      id: 'opt-out-agent',
      name: 'OptOut',
      description: 'An agent that opts out',
      instructions: 'Nothing',
      async getTools() {
        return null
      },
    })
    registerAgentPlugin(makePlugin([agent]))

    const result = await loadAgents(DEFAULTS, {}, mockMemory)

    expect(result['opt-out-agent']).toBeUndefined()
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('passes correct context to getTools', async () => {
    const getToolsSpy = vi.fn().mockResolvedValue({})
    const agent = defineAgent({
      id: 'ctx-agent',
      name: 'Ctx',
      description: 'Tests context',
      instructions: 'Check context',
      getTools: getToolsSpy,
    })
    registerAgentPlugin(makePlugin([agent]))

    const env = { MY_KEY: 'my-value' }
    await loadAgents(DEFAULTS, env, mockMemory)

    expect(getToolsSpy).toHaveBeenCalledOnce()
    const ctx = getToolsSpy.mock.calls[0][0]
    expect(ctx.model).toBe('anthropic/claude-sonnet-4-20250514')
    expect(ctx.env).toBe(env)
    expect(ctx.pluginConfig).toEqual({ enabled: true })
  })

  it('uses agent-specific model override in getTools context', async () => {
    const getToolsSpy = vi.fn().mockResolvedValue({})
    const agent = defineAgent({
      id: 'model-agent',
      name: 'Model',
      description: 'Tests model override',
      instructions: 'Check model',
      getTools: getToolsSpy,
    })
    registerAgentPlugin(makePlugin([agent]))

    const config = {
      ...DEFAULTS,
      agents: {
        'model-agent': {
          enabled: true,
          model: { provider: 'openai', model: 'gpt-4o' },
        },
      },
    }

    await loadAgents(config, {}, mockMemory)

    const ctx = getToolsSpy.mock.calls[0][0]
    expect(ctx.model).toBe('openai/gpt-4o')
  })

  it('loads other agents even when one opts out', async () => {
    const agentA = defineAgent({
      id: 'agent-a',
      name: 'A',
      description: 'First',
      instructions: 'A',
      async getTools() {
        return null
      },
    })
    const agentB = defineAgent({
      id: 'agent-b',
      name: 'B',
      description: 'Second',
      instructions: 'B',
      async getTools() {
        return { someTool: {} }
      },
    })
    registerAgentPlugin(makePlugin([agentA, agentB]))

    const result = await loadAgents(DEFAULTS, {}, mockMemory)

    expect(result['agent-a']).toBeUndefined()
    expect(result['agent-b']).toBeDefined()
  })

  it('getTools empty object results in agent loaded with no extra tools', async () => {
    const agent = defineAgent({
      id: 'empty-tools-agent',
      name: 'Empty',
      description: 'Returns empty tools',
      instructions: 'Do things',
      async getTools() {
        return {}
      },
    })
    registerAgentPlugin(makePlugin([agent]))

    const result = await loadAgents(DEFAULTS, {}, mockMemory)

    expect(result['empty-tools-agent']).toBeDefined()
    const config = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(config.tools).toEqual({})
  })

  it('stores alerts from getTools returning { tools, alerts }', async () => {
    const agent = defineAgent({
      id: 'alert-agent',
      name: 'AlertAgent',
      description: 'Agent with alerts',
      instructions: 'Do things',
      async getTools() {
        return {
          tools: { myTool: { type: 'test' } },
          alerts: [{ level: 'info' as const, message: 'Using test search' }],
        }
      },
    })
    registerAgentPlugin(makePlugin([agent]))

    await loadAgents(DEFAULTS, {}, mockMemory)

    expect(getAgentAlerts('alert-agent')).toEqual([{ level: 'info', message: 'Using test search' }])
  })

  it('stores alerts even when agent opts out (null tools)', async () => {
    const agent = defineAgent({
      id: 'optout-alert-agent',
      name: 'OptOutAlert',
      description: 'Opts out but has warnings',
      instructions: 'Nothing',
      async getTools() {
        return {
          tools: null,
          alerts: [{ level: 'warning' as const, message: 'No search backend available' }],
        }
      },
    })
    registerAgentPlugin(makePlugin([agent]))

    const result = await loadAgents(DEFAULTS, {}, mockMemory)

    expect(result['optout-alert-agent']).toBeUndefined()
    expect(getAgentAlerts('optout-alert-agent')).toEqual([
      { level: 'warning', message: 'No search backend available' },
    ])
  })

  it('returns no alerts for plain ToolRecord return', async () => {
    const agent = defineAgent({
      id: 'no-alert-agent',
      name: 'NoAlert',
      description: 'No alerts',
      instructions: 'Do things',
      async getTools() {
        return { myTool: {} }
      },
    })
    registerAgentPlugin(makePlugin([agent]))

    await loadAgents(DEFAULTS, {}, mockMemory)

    expect(getAgentAlerts('no-alert-agent')).toEqual([])
  })
})
