import type { MastraMemory } from '@mastra/core/memory'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../config'
import { loadAgents } from './load-agents'
import type { RegisteredPlugin } from './plugin-registry'
import { createPluginRegistry } from './plugin-registry'

// Mock MastraAgent to capture constructor calls
const mockAgentConstructor = vi.fn()
vi.mock('@mastra/core/agent', () => ({
  Agent: class MockAgent {
    id: string
    constructor(config: Record<string, unknown>) {
      mockAgentConstructor(config)
      this.id = config.id as string
    }
  },
}))

// Mock model-tools to avoid dynamic imports
vi.mock('../agents/model-tools', () => ({
  resolveModelTools: vi.fn().mockResolvedValue({ tools: {}, alerts: [] }),
}))

const mockMemory = {} as MastraMemory

function configWith(...pluginIds: string[]) {
  const plugins: Record<string, { enabled: boolean }> = {}
  for (const id of pluginIds) plugins[id] = { enabled: true }
  return { ...DEFAULTS, plugins }
}

function makeAgentPlugin(overrides?: Partial<RegisteredPlugin>): RegisteredPlugin {
  return {
    id: 'test-agent-plugin',
    name: 'Test Agent Plugin',
    envVars: [],
    configFields: [],
    agents: {
      definitions: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          instructions: 'You are a test agent.',
          useTools: [],
        },
      ],
      manifests: new Map([
        [
          'test-agent',
          {
            id: 'test-agent',
            name: 'Test Agent',
            description: 'A test agent',
            instructions: 'You are a test agent.',
          },
        ],
      ]),
    },
    ...overrides,
  }
}

describe('loadAgents', () => {
  it('loads agents from plugins with manifests', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('test-agent-plugin', makeAgentPlugin())

    const agents = await loadAgents(registry, configWith('test-agent-plugin'), mockMemory, {})
    expect(agents['test-agent-plugin:test-agent']).toBeDefined()
    expect(agents['test-agent-plugin:test-agent'].id).toBe('test-agent-plugin:test-agent')
  })

  it('skips agents when plugin is disabled', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('test-agent-plugin', makeAgentPlugin())

    const config = {
      ...DEFAULTS,
      plugins: { 'test-agent-plugin': { enabled: false } },
    }
    const agents = await loadAgents(registry, config, mockMemory, {})
    expect(Object.keys(agents)).toHaveLength(0)
  })

  it('skips agents when required env vars are missing', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'test-agent-plugin',
      makeAgentPlugin({
        envVars: [{ name: 'REQUIRED_KEY' }],
      }),
    )

    const agents = await loadAgents(registry, configWith('test-agent-plugin'), mockMemory, {})
    expect(Object.keys(agents)).toHaveLength(0)
  })

  it('loads agents when required env vars are present', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'test-agent-plugin',
      makeAgentPlugin({
        envVars: [{ name: 'REQUIRED_KEY' }],
      }),
    )

    const agents = await loadAgents(registry, configWith('test-agent-plugin'), mockMemory, {
      REQUIRED_KEY: 'value',
    })
    expect(agents['test-agent-plugin:test-agent']).toBeDefined()
  })

  it('skips env check for optional env vars', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'test-agent-plugin',
      makeAgentPlugin({
        envVars: [{ name: 'OPTIONAL_KEY', required: false }],
      }),
    )

    const agents = await loadAgents(registry, configWith('test-agent-plugin'), mockMemory, {})
    expect(agents['test-agent-plugin:test-agent']).toBeDefined()
  })

  it('skips agent definition when manifest is missing', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'test-agent-plugin',
      makeAgentPlugin({
        agents: {
          definitions: [
            {
              id: 'no-manifest',
              name: 'No Manifest',
              description: 'Missing manifest',
              instructions: 'N/A',
              useTools: [],
            },
          ],
          manifests: new Map(), // no matching manifest
        },
      }),
    )

    const agents = await loadAgents(registry, DEFAULTS, mockMemory, {})
    expect(Object.keys(agents)).toHaveLength(0)
  })

  it('resolves inherited tools from global tools', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'test-agent-plugin',
      makeAgentPlugin({
        agents: {
          definitions: [
            {
              id: 'test-agent',
              name: 'Test',
              description: 'Test',
              instructions: 'Test',
              useTools: ['plugin:greet'],
            },
          ],
          manifests: new Map([
            [
              'test-agent',
              {
                id: 'test-agent',
                name: 'Test',
                description: 'Test',
                instructions: 'Test',
              },
            ],
          ]),
        },
      }),
    )

    const globalTools = { 'plugin:greet': { execute: vi.fn() } as never }
    const agents = await loadAgents(
      registry,
      configWith('test-agent-plugin'),
      mockMemory,
      {},
      globalTools,
    )
    expect(agents['test-agent-plugin:test-agent']).toBeDefined()

    // Verify the agent was constructed with the inherited tool
    const lastCall = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(lastCall.tools).toHaveProperty('plugin:greet')
  })

  it('uses default model when no per-agent config exists', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('test-agent-plugin', makeAgentPlugin())

    await loadAgents(registry, configWith('test-agent-plugin'), mockMemory, {})

    const lastCall = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(lastCall.model).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('uses per-agent model config from plugin config', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('test-agent-plugin', makeAgentPlugin())

    const config = {
      ...DEFAULTS,
      plugins: {
        'test-agent-plugin': {
          enabled: true,
          agents: {
            'test-agent': {
              model: { provider: 'openai', model: 'gpt-4o' },
            },
          },
        },
      },
    }

    await loadAgents(registry, config, mockMemory, {})

    const lastCall = mockAgentConstructor.mock.calls.at(-1)?.[0]
    expect(lastCall.model).toBe('openai/gpt-4o')
  })

  it('skips plugins without agents capability', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('tools-only', {
      id: 'tools-only',
      name: 'Tools Only',
      envVars: [],
      configFields: [],
      tools: {
        entries: [],
        manifests: new Map(),
      },
    })

    const agents = await loadAgents(registry, DEFAULTS, mockMemory, {})
    expect(Object.keys(agents)).toHaveLength(0)
  })
})
