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
        namespace: { tools: [toolExport], resolveTools: async () => ({ tools: [] }) },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.tools).toBeDefined()
    expect(result.tools?.entries).toHaveLength(1)
    expect(result.tools?.entries[0]).toBe(toolExport)
    expect(result.tools?.resolveTools).toBeTypeOf('function')
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
    expect(result.tools?.sandbox).toBe('host')
    expect(result.tools?.permissions).toEqual(permissions)
    expect(result.tools?.entries[0].sandbox).toBe('host')
    expect(result.tools?.entries[0].permissions).toEqual(permissions)
  })

  it('adapts agent entries and populates manifests map', () => {
    const entries: LoadedEntry[] = [
      {
        key: 'agents',
        entry: { entry: './src/agent-a.ts' },
        namespace: {
          agent: {
            id: 'agent-a',
            name: 'Agent A',
            description: 'First agent',
            instructions: 'Do A',
          },
        },
      },
      {
        key: 'agents',
        entry: { entry: './src/agent-b.ts' },
        namespace: {
          agent: {
            id: 'agent-b',
            name: 'Agent B',
            description: 'Second agent',
            instructions: 'Do B',
          },
        },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.agents).toBeDefined()
    expect(result.agents?.definitions).toHaveLength(2)
    expect(result.agents?.manifests.get('agent-a')).toBeDefined()
    expect(result.agents?.manifests.get('agent-b')).toBeDefined()
  })

  it('stamps useTools and modelTools from provides entry onto AgentDefinition', () => {
    const entries: LoadedEntry[] = [
      {
        key: 'agents',
        entry: {
          entry: './src/web-search.ts',
          useTools: ['web_search'],
          modelTools: ['search'],
        } as LoadedEntry['entry'],
        namespace: {
          agent: {
            id: 'web-search',
            name: 'Web Search',
            description: 'Search agent',
            instructions: 'Search the web',
          },
        },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    const agentDef = result.agents?.definitions[0]
    expect(agentDef).toBeDefined()
    expect(agentDef?.useTools).toEqual(['web_search'])
    expect(agentDef?.modelTools).toEqual(['search'])
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
    expect(result.agents).toBeUndefined()
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
    expect(result.channels).toBeDefined()
    expect(result.channels?.factory).toBe(factory)
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
        namespace: {
          agent: {
            id: 'my-agent',
            name: 'My Agent',
            description: 'Test agent',
            instructions: 'Do things',
          },
        },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.tools).toBeDefined()
    expect(result.agents).toBeDefined()
    expect(result.channels).toBeUndefined()
  })

  it('returns empty capabilities when no entries', () => {
    const result = adaptManifest(baseManifest, [])
    expect(result.tools).toBeUndefined()
    expect(result.agents).toBeUndefined()
    expect(result.channels).toBeUndefined()
  })

  it('includes manifest metadata in adapted plugin', () => {
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
    expect(result.envVars).toEqual([{ name: 'API_KEY' }])
    expect(result.configFields).toEqual([{ key: 'backend', label: 'Backend', type: 'text' }])
  })

  it('propagates all metadata fields', () => {
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
    ]

    const result = adaptManifest(manifest, entries)
    expect(result.id).toBe('test-plugin')
    expect(result.name).toBe('Test Plugin')
    expect(result.description).toBe('A test plugin')
    expect(result.author).toBe('Test Author')
    expect(result.icon).toBe('https://example.com/icon.png')
    expect(result.version).toBe('1.2.0')
    expect(result.homepage).toBe('https://example.com')
    expect(result.repository).toBe('https://github.com/example/plugin')
    expect(result.license).toBe('MIT')
  })

  it('builds tool manifests map from entries', () => {
    const toolExport = {
      id: 'greet',
      name: 'Greet',
      description: 'Greet someone',
      execute: async () => ({}),
    }
    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/index.ts' },
        namespace: { tools: [toolExport] },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.tools?.manifests.get('greet')).toBeDefined()
    expect(result.tools?.manifests.get('greet')?.name).toBe('Greet')
  })

  it('builds schema from configFields', () => {
    const manifest: PluginManifest = {
      ...baseManifest,
      configFields: [{ key: 'apiKey', label: 'API Key', type: 'text', required: true }],
    }

    const result = adaptManifest(manifest, [])
    expect(result.schema).toBeDefined()
  })
})
