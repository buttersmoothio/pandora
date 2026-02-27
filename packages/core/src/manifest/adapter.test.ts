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
  it('adapts a tools entry', () => {
    const entries: LoadedEntry[] = [
      {
        key: 'tools',
        entry: { entry: './src/index.ts' },
        namespace: {
          tools: [{ id: 'my-tool' }],
          getTools: async () => ({}),
        },
      },
    ]

    const result = adaptManifest(baseManifest, entries)
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].id).toBe('test-plugin')
    expect(result.tools[0].tools).toHaveLength(1)
    expect(result.tools[0].getTools).toBeTypeOf('function')
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
})
