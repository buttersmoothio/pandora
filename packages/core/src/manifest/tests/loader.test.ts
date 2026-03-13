import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoveredPlugin } from '../discover'
import type { ProvidesEntry, ProvidesKey } from '../schema'

// Mock the compartment loader
const mockLoadInCompartment: ReturnType<typeof vi.fn> = vi.fn()
vi.mock('../compartment-loader', () => ({
  loadInCompartment: (...args: unknown[]) => mockLoadInCompartment(...args),
}))

// biome-ignore lint/nursery/useExplicitType: dynamic import type is inferred
const { loadEntry } = await import('../loader')

function makePlugin(
  id: string = 'test-plugin',
  packageDir: string = '/plugins/test',
): DiscoveredPlugin {
  return {
    manifest: {
      manifestVersion: 1,
      id,
      name: 'Test Plugin',
      pandora: '>=0.0.1',
      provides: {},
    },
    packageDir,
    manifestPath: `${packageDir}/pandora.manifest.json`,
  }
}

const entry: ProvidesEntry = { entry: './src/index.ts' }

describe('loadEntry', () => {
  it('loads tools in compartment mode by default', async () => {
    const ns = { tools: [] }
    mockLoadInCompartment.mockResolvedValueOnce(ns)

    const result = await loadEntry(makePlugin(), 'tools', entry)

    expect(result.key).toBe('tools')
    expect(result.entry).toBe(entry)
    expect(result.namespace).toBe(ns)
    expect(mockLoadInCompartment).toHaveBeenCalledWith(
      expect.objectContaining({
        packageDir: '/plugins/test',
        entryPath: resolve('/plugins/test', './src/index.ts'),
        pluginId: 'test-plugin',
      }),
    )
  })

  it('loads tools in host mode when sandbox is "host"', async () => {
    const hostEntry: ProvidesEntry = { entry: './src/index.ts', sandbox: 'host' }

    // Dynamic import will fail for a fake path, so we test the branch
    // by verifying compartment loader is NOT called
    mockLoadInCompartment.mockClear()

    await expect(loadEntry(makePlugin(), 'tools', hostEntry)).rejects.toThrow()
    expect(mockLoadInCompartment).not.toHaveBeenCalled()
  })

  it('forces host mode for agents regardless of sandbox setting', async () => {
    mockLoadInCompartment.mockClear()

    // Agents always use host mode — compartment loader should not be called
    await expect(loadEntry(makePlugin(), 'agents', entry)).rejects.toThrow()
    expect(mockLoadInCompartment).not.toHaveBeenCalled()
  })

  it('forces host mode for channels regardless of sandbox setting', async () => {
    mockLoadInCompartment.mockClear()

    await expect(loadEntry(makePlugin(), 'channels', entry)).rejects.toThrow()
    expect(mockLoadInCompartment).not.toHaveBeenCalled()
  })

  it('passes permissions and env vars to compartment loader', async () => {
    const permissions = { network: ['api.example.com'], env: ['API_KEY'] }
    const permEntry: ProvidesEntry = { entry: './src/index.ts', permissions }
    mockLoadInCompartment.mockResolvedValueOnce({})

    await loadEntry(makePlugin(), 'tools', permEntry)

    expect(mockLoadInCompartment).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions,
        envVars: process.env,
      }),
    )
  })

  it('resolves entry path relative to package directory', async () => {
    mockLoadInCompartment.mockResolvedValueOnce({})
    const plugin = makePlugin('my-plugin', '/custom/path')

    await loadEntry(plugin, 'tools', { entry: './lib/tools.js' })

    expect(mockLoadInCompartment).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPath: resolve('/custom/path', './lib/tools.js'),
      }),
    )
  })

  it('returns key and entry in result', async () => {
    mockLoadInCompartment.mockResolvedValueOnce({ tools: [] })
    const key: ProvidesKey = 'tools'

    const result = await loadEntry(makePlugin(), key, entry)

    expect(result.key).toBe(key)
    expect(result.entry).toBe(entry)
  })
})
