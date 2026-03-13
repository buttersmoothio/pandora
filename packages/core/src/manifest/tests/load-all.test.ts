import { describe, expect, it, vi } from 'vitest'
import type { DiscoveredPlugin } from '../discover'
import type { PluginManifest } from '../schema'

// Mock dependencies
const mockDiscoverPlugins: ReturnType<typeof vi.fn> = vi.fn()
const mockLoadEntry: ReturnType<typeof vi.fn> = vi.fn()

vi.mock('../discover', () => ({
  discoverPlugins: (...args: unknown[]) => mockDiscoverPlugins(...args),
}))

vi.mock('../loader', () => ({
  loadEntry: (...args: unknown[]) => mockLoadEntry(...args),
}))

// biome-ignore lint/nursery/useExplicitType: dynamic import type is inferred
const { loadAllPlugins } = await import('../load-all')

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    manifestVersion: 1,
    id: 'test-plugin',
    name: 'Test Plugin',
    pandora: '>=0.0.1',
    provides: {},
    ...overrides,
  }
}

function makeDiscovered(
  manifest: PluginManifest,
  packageDir: string = '/plugins/test',
): DiscoveredPlugin {
  return {
    manifest,
    packageDir,
    manifestPath: `${packageDir}/pandora.manifest.json`,
  }
}

describe('loadAllPlugins', () => {
  it('returns empty registry when no plugins discovered', async () => {
    mockDiscoverPlugins.mockResolvedValueOnce([])

    const registry = await loadAllPlugins('/some/dir')

    expect(registry.plugins.size).toBe(0)
  })

  it('passes packagesDir to discoverPlugins', async () => {
    mockDiscoverPlugins.mockResolvedValueOnce([])

    await loadAllPlugins('/custom/packages')

    expect(mockDiscoverPlugins).toHaveBeenCalledWith('/custom/packages')
  })

  it('registers a plugin with tools', async () => {
    const manifest = makeManifest({
      id: 'my-tools',
      name: 'My Tools',
      provides: { tools: { entry: './src/index.ts' } },
    })
    mockDiscoverPlugins.mockResolvedValueOnce([makeDiscovered(manifest)])
    mockLoadEntry.mockResolvedValueOnce({
      key: 'tools',
      entry: { entry: './src/index.ts' },
      namespace: {
        tools: [{ id: 'greet', name: 'Greet', description: 'Greet', execute: async () => ({}) }],
      },
    })

    const registry = await loadAllPlugins()

    expect(registry.plugins.size).toBe(1)
    expect(registry.plugins.has('my-tools')).toBe(true)
    const plugin = registry.plugins.get('my-tools')
    expect(plugin).toBeDefined()
    expect(plugin?.name).toBe('My Tools')
    expect(plugin?.tools?.entries).toHaveLength(1)
  })

  it('registers multiple plugins', async () => {
    const m1 = makeManifest({ id: 'plugin-a', name: 'Alpha', provides: {} })
    const m2 = makeManifest({ id: 'plugin-b', name: 'Beta', provides: {} })
    mockDiscoverPlugins.mockResolvedValueOnce([makeDiscovered(m1), makeDiscovered(m2)])

    const registry = await loadAllPlugins()

    expect(registry.plugins.size).toBe(2)
    expect(registry.plugins.has('plugin-a')).toBe(true)
    expect(registry.plugins.has('plugin-b')).toBe(true)
  })

  it('skips duplicate plugin IDs', async () => {
    const m1 = makeManifest({ id: 'same-id', name: 'First' })
    const m2 = makeManifest({ id: 'same-id', name: 'Second' })
    mockDiscoverPlugins.mockResolvedValueOnce([makeDiscovered(m1), makeDiscovered(m2)])

    const registry = await loadAllPlugins()

    expect(registry.plugins.size).toBe(1)
    expect(registry.plugins.get('same-id')?.name).toBe('First')
  })

  it('continues loading when a plugin fails', async () => {
    const m1 = makeManifest({
      id: 'broken',
      name: 'Broken',
      provides: { tools: { entry: './src/index.ts' } },
    })
    const m2 = makeManifest({ id: 'good', name: 'Good', provides: {} })
    mockDiscoverPlugins.mockResolvedValueOnce([makeDiscovered(m1), makeDiscovered(m2)])
    mockLoadEntry.mockRejectedValueOnce(new Error('Module not found'))

    const registry = await loadAllPlugins()

    expect(registry.plugins.size).toBe(1)
    expect(registry.plugins.has('good')).toBe(true)
    expect(registry.plugins.has('broken')).toBe(false)
  })

  it('continues loading when a plugin throws non-Error', async () => {
    const m1 = makeManifest({
      id: 'broken',
      name: 'Broken',
      provides: { tools: { entry: './src/index.ts' } },
    })
    const m2 = makeManifest({ id: 'good', name: 'Good', provides: {} })
    mockDiscoverPlugins.mockResolvedValueOnce([makeDiscovered(m1), makeDiscovered(m2)])
    mockLoadEntry.mockRejectedValueOnce('string error')

    const registry = await loadAllPlugins()

    expect(registry.plugins.size).toBe(1)
    expect(registry.plugins.has('good')).toBe(true)
  })

  it('loads entries for each provides key', async () => {
    const manifest = makeManifest({
      id: 'multi',
      name: 'Multi',
      provides: {
        tools: { entry: './src/tools.ts' },
        agents: { entry: './src/agent.ts' },
      },
    })
    mockDiscoverPlugins.mockResolvedValueOnce([makeDiscovered(manifest)])
    mockLoadEntry
      .mockResolvedValueOnce({
        key: 'tools',
        entry: { entry: './src/tools.ts' },
        namespace: { tools: [] },
      })
      .mockResolvedValueOnce({
        key: 'agents',
        entry: { entry: './src/agent.ts' },
        namespace: {
          agent: {
            id: 'test-agent',
            name: 'Test Agent',
            description: 'An agent',
            instructions: 'Do stuff',
          },
        },
      })

    const registry = await loadAllPlugins()

    expect(registry.plugins.size).toBe(1)
    const plugin = registry.plugins.get('multi')
    expect(plugin).toBeDefined()
    expect(plugin?.tools).toBeDefined()
    expect(plugin?.agents).toBeDefined()
  })
})
