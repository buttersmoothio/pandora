import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../config'
import { loadTools } from './load-tools'
import type { RegisteredPlugin } from './plugin-registry'
import { createPluginRegistry } from './plugin-registry'

function makeToolPlugin(overrides?: Partial<RegisteredPlugin>): RegisteredPlugin {
  return {
    id: 'test-tools',
    name: 'Test Tools',
    envVars: [],
    configFields: [],
    tools: {
      entries: [
        {
          id: 'greet',
          name: 'Greet',
          description: 'Greet someone',
          execute: async () => ({ hello: 'world' }),
        },
      ],
      manifests: new Map(),
    },
    ...overrides,
  }
}

describe('loadTools', () => {
  it('loads tools from enabled plugins', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('test-tools', makeToolPlugin())

    const tools = await loadTools(registry, DEFAULTS, {})
    expect(tools['test-tools:greet']).toBeDefined()
  })

  it('skips disabled plugins', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('test-tools', makeToolPlugin())

    const config = { ...DEFAULTS, plugins: { 'test-tools': { enabled: false } } }
    const tools = await loadTools(registry, config, {})
    expect(Object.keys(tools)).toHaveLength(0)
  })

  it('calls resolveTools hook and includes dynamic tools', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'test-tools',
      makeToolPlugin({
        tools: {
          entries: [],
          manifests: new Map(),
          resolveTools: async () => ({
            tools: [
              {
                id: 'dynamic-tool',
                name: 'Dynamic',
                description: 'Dynamically resolved',
                execute: async () => ({}),
              },
            ],
          }),
        },
      }),
    )

    const tools = await loadTools(registry, DEFAULTS, {})
    expect(tools['test-tools:dynamic-tool']).toBeDefined()
  })

  it('skips plugins without tools capability', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('channel-only', {
      id: 'channel-only',
      name: 'Channel Only',
      envVars: [],
      configFields: [],
      channels: { factory: () => null },
    })

    const tools = await loadTools(registry, DEFAULTS, {})
    expect(Object.keys(tools)).toHaveLength(0)
  })

  it('loads tools from multiple plugins', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set(
      'plugin-a',
      makeToolPlugin({
        id: 'plugin-a',
        tools: {
          entries: [{ id: 'tool-a', name: 'Tool A', description: 'A', execute: async () => ({}) }],
          manifests: new Map(),
        },
      }),
    )
    registry.plugins.set(
      'plugin-b',
      makeToolPlugin({
        id: 'plugin-b',
        tools: {
          entries: [{ id: 'tool-b', name: 'Tool B', description: 'B', execute: async () => ({}) }],
          manifests: new Map(),
        },
      }),
    )

    const tools = await loadTools(registry, DEFAULTS, {})
    expect(tools['plugin-a:tool-a']).toBeDefined()
    expect(tools['plugin-b:tool-b']).toBeDefined()
  })
})
