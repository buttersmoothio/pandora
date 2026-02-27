import { describe, expect, it } from 'vitest'
import { adaptManifest } from './adapter'
import type { LoadedEntry } from './loader'
import type { PluginManifest } from './schema'

const baseManifest: PluginManifest = {
  manifestVersion: 1,
  id: 'test-plugin',
  name: 'Test Plugin',
  pandora: '>=0.0.1',
  provides: {},
}

describe('adaptManifest', () => {
  it('adapts a tools entry with ToolExports', () => {
    const toolExport = {
      id: 'greet',
      name: 'Greet',
      description: 'Greet someone',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      execute: async (input: { name: string }) => ({ greeting: `Hello ${input.name}` }),
    }
    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/index.ts', sandbox: 'compartment' },
        namespace: { tools: [toolExport], getTools: async () => ({}) },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].id).toBe('test-plugin')
    expect(result.tools[0].tools).toHaveLength(1)
    expect(result.tools[0].tools[0]).toBe(toolExport)
    expect(result.tools[0].getTools).toBeTypeOf('function')
  })

  it('stamps tool exports with sandbox and permissions from provides entry', () => {
    const toolExport = {
      id: 'search',
      name: 'Search',
      description: 'Search the web',
      execute: async () => ({}),
    }
    const permissions = { network: ['api.example.com'], env: ['API_KEY'] }
    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/index.ts', sandbox: 'host', permissions },
        namespace: { tools: [toolExport] },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    const plugin = result.tools[0]
    expect(plugin.sandbox).toBe('host')
    expect(plugin.permissions).toEqual(permissions)
    expect(plugin.tools[0].sandbox).toBe('host')
    expect(plugin.tools[0].permissions).toEqual(permissions)
  })

  it('adapts agent entries (one per entry point)', () => {
    const entries: LoadedEntry[] = [
      {
        key: 'agents',
        entry: { entry: './src/agent-a.ts' },
        namespace: { agent: { id: 'agent-a' } },
      },
      {
        key: 'agents',
        entry: { entry: './src/agent-b.ts' },
        namespace: { agent: { id: 'agent-b' } },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0].agents).toHaveLength(2)
  })

  it('skips agent entries without an agent export', () => {
    const entries: LoadedEntry[] = [
      {
        key: 'agents',
        entry: { entry: './src/agent-a.ts' },
        namespace: {},
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.agents).toHaveLength(0)
  })

  it('adapts a channel entry', () => {
    const factory = () => null

    const entries: LoadedEntry[] = [
      {
        key: 'channels',
        entry: { entry: './src/index.ts' },
        namespace: { factory },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.channels).toHaveLength(1)
    expect(result.channels[0].factory).toBe(factory)
  })

  it('adapts a storage entry', () => {
    const factory = async () => ({})

    const entries: LoadedEntry[] = [
      {
        key: 'storage',
        entry: { entry: './src/index.ts' },
        namespace: { factory },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.storage).toHaveLength(1)
    expect(result.storage[0].factory).toBe(factory)
  })

  it('adapts a vector entry', () => {
    const factory = async () => ({})

    const entries: LoadedEntry[] = [
      {
        key: 'vector',
        entry: { entry: './src/index.ts' },
        namespace: { factory },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.vector).toHaveLength(1)
    expect(result.vector[0].factory).toBe(factory)
  })

  it('handles mixed capabilities from one manifest', () => {
    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/tools.ts' },
        namespace: { tools: [] },
      },
      {
        key: 'agents',
        entry: { entry: './src/my-agent.ts' },
        namespace: { agent: { id: 'my-agent' } },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.tools).toHaveLength(1)
    expect(result.agents).toHaveLength(1)
    expect(result.channels).toHaveLength(0)
  })

  it('returns empty arrays when no entries', () => {
    const result = adaptManifest(baseManifest, [])
    expect(result.tools).toHaveLength(0)
    expect(result.agents).toHaveLength(0)
    expect(result.channels).toHaveLength(0)
    expect(result.storage).toHaveLength(0)
    expect(result.vector).toHaveLength(0)
  })

  it('includes manifest metadata in adapted plugins', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      envVars: [{ name: 'API_KEY' }],
      configFields: [{ key: 'backend', label: 'Backend', type: 'text' }],
    }

    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/index.ts' },
        namespace: { tools: [] },
      },
    ]

    const result = adaptManifest(manifest, entries)
    expect(result.tools[0].envVars).toEqual([{ name: 'API_KEY' }])
    expect(result.tools[0].configFields).toEqual([
      { key: 'backend', label: 'Backend', type: 'text' },
    ])
  })

  it('propagates all metadata fields to every plugin type', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      description: 'A test plugin',
      author: 'Test Author',
      icon: 'https://example.com/icon.png',
      version: '1.2.0',
      homepage: 'https://example.com',
      repository: 'https://github.com/example/plugin',
      license: 'MIT',
      envVars: [{ name: 'API_KEY' }],
      configFields: [{ key: 'mode', label: 'Mode', type: 'text' }],
    }

    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/tools.ts' },
        namespace: { tools: [] },
      },
      {
        key: 'agents',
        entry: { entry: './src/agent.ts' },
        namespace: { agent: { id: 'test-agent' } },
      },
      {
        key: 'channels',
        entry: { entry: './src/channel.ts' },
        namespace: { factory: () => null },
      },
      {
        key: 'storage',
        entry: { entry: './src/storage.ts' },
        namespace: { factory: async () => ({}) },
      },
      {
        key: 'vector',
        entry: { entry: './src/vector.ts' },
        namespace: { factory: async () => ({}) },
      },
    ]

    const result = adaptManifest(manifest, entries)

    const expected = {
      id: 'test-plugin',
      name: 'Test Plugin',
      description: 'A test plugin',
      author: 'Test Author',
      icon: 'https://example.com/icon.png',
      version: '1.2.0',
      homepage: 'https://example.com',
      repository: 'https://github.com/example/plugin',
      license: 'MIT',
      envVars: [{ name: 'API_KEY' }],
      configFields: [{ key: 'mode', label: 'Mode', type: 'text' }],
    }

    for (const plugin of [
      result.tools[0],
      result.agents[0],
      result.channels[0],
      result.storage[0],
      result.vector[0],
    ]) {
      expect(plugin.id).toBe(expected.id)
      expect(plugin.name).toBe(expected.name)
      expect(plugin.description).toBe(expected.description)
      expect(plugin.author).toBe(expected.author)
      expect(plugin.icon).toBe(expected.icon)
      expect(plugin.version).toBe(expected.version)
      expect(plugin.homepage).toBe(expected.homepage)
      expect(plugin.repository).toBe(expected.repository)
      expect(plugin.license).toBe(expected.license)
      expect(plugin.envVars).toEqual(expected.envVars)
      expect(plugin.configFields).toEqual(expected.configFields)
    }
  })
})
