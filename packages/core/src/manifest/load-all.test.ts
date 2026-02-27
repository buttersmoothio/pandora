import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearAgentPlugins } from '../agents'
import { clearChannelPlugins } from '../channels'
import { clearStoragePlugins, getAllRegisteredStoragePlugins } from '../storage'
import { clearToolPlugins, getAllRegisteredToolPlugins } from '../tools'
import { clearVectorPlugins } from '../vector'
import { loadAllPlugins } from './load-all'

const testDir = join(tmpdir(), 'pandora-load-all-test')

function writePlugin(
  name: string,
  manifest: unknown,
  entryRelPath: string,
  entryCode: string,
): void {
  const dir = join(testDir, name)
  const entryPath = join(dir, entryRelPath)
  const entryDir = entryPath.substring(0, entryPath.lastIndexOf('/'))
  mkdirSync(entryDir, { recursive: true })
  writeFileSync(join(dir, 'pandora.manifest.json'), JSON.stringify(manifest))
  writeFileSync(entryPath, entryCode)
}

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  clearToolPlugins()
  clearAgentPlugins()
  clearChannelPlugins()
  clearStoragePlugins()
  clearVectorPlugins()
})

describe('loadAllPlugins', () => {
  it('discovers and registers a tool plugin', async () => {
    writePlugin(
      'my-tools',
      {
        manifestVersion: 1,
        id: 'my-tools',
        name: 'My Tools',
        pandora: '>=0.0.1',
        provides: { tools: { entry: './src/index.ts' } },
      },
      'src/index.ts',
      'export const tools = []',
    )

    await loadAllPlugins(testDir)
    const plugins = getAllRegisteredToolPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('my-tools')
  })

  it('discovers and registers a storage plugin', async () => {
    writePlugin(
      'my-storage',
      {
        manifestVersion: 1,
        id: 'my-storage',
        name: 'My Storage',
        pandora: '>=0.0.1',
        provides: { storage: { entry: './src/index.ts' } },
      },
      'src/index.ts',
      'export const factory = async () => ({})',
    )

    await loadAllPlugins(testDir)
    const plugins = getAllRegisteredStoragePlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('my-storage')
  })

  it('skips plugins with invalid manifests', async () => {
    const dir = join(testDir, 'bad-plugin')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'pandora.manifest.json'), '{ "manifestVersion": 99 }')

    await loadAllPlugins(testDir)
    expect(getAllRegisteredToolPlugins()).toHaveLength(0)
  })

  it('skips plugins with missing entry files', async () => {
    const dir = join(testDir, 'missing-entry')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'pandora.manifest.json'),
      JSON.stringify({
        manifestVersion: 1,
        id: 'missing-entry',
        name: 'Missing Entry',
        pandora: '>=0.0.1',
        provides: { tools: { entry: './src/nonexistent.ts' } },
      }),
    )

    await loadAllPlugins(testDir)
    expect(getAllRegisteredToolPlugins()).toHaveLength(0)
  })

  it('loads multiple plugins', async () => {
    writePlugin(
      'tools-a',
      {
        manifestVersion: 1,
        id: 'tools-a',
        name: 'Tools A',
        pandora: '>=0.0.1',
        provides: { tools: { entry: './src/index.ts' } },
      },
      'src/index.ts',
      'export const tools = []',
    )
    writePlugin(
      'tools-b',
      {
        manifestVersion: 1,
        id: 'tools-b',
        name: 'Tools B',
        pandora: '>=0.0.1',
        provides: { tools: { entry: './src/index.ts' } },
      },
      'src/index.ts',
      'export const tools = []',
    )

    await loadAllPlugins(testDir)
    expect(getAllRegisteredToolPlugins()).toHaveLength(2)
  })
})
