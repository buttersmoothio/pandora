import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverPlugins } from './discover'

const testDir = join(tmpdir(), 'pandora-discover-test')

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

function writeManifest(name: string, manifest: unknown): void {
  const dir = join(testDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'pandora.manifest.json'), JSON.stringify(manifest))
}

describe('discoverPlugins', () => {
  it('discovers valid manifests', async () => {
    writeManifest('my-plugin', {
      manifestVersion: 1,
      id: 'my-plugin',
      name: 'My Plugin',
      pandora: '>=0.0.1',
      provides: { tools: { entry: './src/index.ts' } },
    })

    const plugins = await discoverPlugins(testDir)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].manifest.id).toBe('my-plugin')
    expect(plugins[0].packageDir).toBe(join(testDir, 'my-plugin'))
  })

  it('discovers multiple plugins', async () => {
    writeManifest('plugin-a', {
      manifestVersion: 1,
      id: 'plugin-a',
      name: 'Plugin A',
      pandora: '>=0.0.1',
      provides: { tools: { entry: './src/index.ts' } },
    })
    writeManifest('plugin-b', {
      manifestVersion: 1,
      id: 'plugin-b',
      name: 'Plugin B',
      pandora: '>=0.0.1',
      provides: { storage: { entry: './src/index.ts' } },
    })

    const plugins = await discoverPlugins(testDir)
    expect(plugins).toHaveLength(2)
    const ids = plugins.map((p) => p.manifest.id).sort()
    expect(ids).toEqual(['plugin-a', 'plugin-b'])
  })

  it('skips directories without manifests', async () => {
    mkdirSync(join(testDir, 'no-manifest'), { recursive: true })
    writeManifest('has-manifest', {
      manifestVersion: 1,
      id: 'has-manifest',
      name: 'Has Manifest',
      pandora: '>=0.0.1',
      provides: { tools: { entry: './src/index.ts' } },
    })

    const plugins = await discoverPlugins(testDir)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].manifest.id).toBe('has-manifest')
  })

  it('skips invalid JSON', async () => {
    const dir = join(testDir, 'bad-json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'pandora.manifest.json'), '{not valid json}')

    const plugins = await discoverPlugins(testDir)
    expect(plugins).toHaveLength(0)
  })

  it('skips manifests that fail schema validation', async () => {
    writeManifest('invalid', {
      manifestVersion: 99,
      id: 'invalid',
    })

    const plugins = await discoverPlugins(testDir)
    expect(plugins).toHaveLength(0)
  })

  it('returns empty for nonexistent directory', async () => {
    const plugins = await discoverPlugins('/nonexistent/path')
    expect(plugins).toHaveLength(0)
  })
})
