import { describe, expect, it } from 'vitest'
import { normalizeProvidesEntries, pluginManifestSchema } from './schema'

describe('pluginManifestSchema', () => {
  const minimal = {
    manifestVersion: 1,
    id: 'test-plugin',
    name: 'Test Plugin',
    pandora: '>=0.0.1',
    provides: {
      tools: { entry: './src/index.ts' },
    },
  }

  it('validates a minimal manifest', () => {
    const result = pluginManifestSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('validates a full manifest', () => {
    const full = {
      $schema: 'https://pandora.dev/schemas/manifest-v1.json',
      manifestVersion: 1,
      id: 'test-plugin',
      name: 'Test Plugin',
      description: 'A test plugin',
      pandora: '>=0.0.1',
      provides: {
        tools: {
          entry: './src/tools.ts',
          sandbox: 'compartment',
          permissions: {
            network: ['api.example.com'],
            env: ['API_KEY'],
            time: true,
          },
        },
        agents: { entry: './src/agents.ts', sandbox: 'host' },
      },
      envVars: [{ name: 'API_KEY', required: true }],
      configFields: [
        {
          key: 'backend',
          label: 'Backend',
          type: 'enum',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      ],
      store: {
        icon: 'search',
        categories: ['search'],
      },
    }

    const result = pluginManifestSchema.safeParse(full)
    expect(result.success).toBe(true)
  })

  it('accepts array provides entries', () => {
    const manifest = {
      ...minimal,
      provides: {
        tools: [
          { entry: './src/search.ts', sandbox: 'compartment' },
          { entry: './src/datetime.ts', sandbox: 'compartment' },
        ],
      },
    }
    const result = pluginManifestSchema.safeParse(manifest)
    expect(result.success).toBe(true)
  })

  it('rejects missing manifestVersion', () => {
    const { manifestVersion: _, ...rest } = minimal
    const result = pluginManifestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects wrong manifestVersion', () => {
    const result = pluginManifestSchema.safeParse({ ...minimal, manifestVersion: 2 })
    expect(result.success).toBe(false)
  })

  it('rejects missing id', () => {
    const { id: _, ...rest } = minimal
    const result = pluginManifestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing provides', () => {
    const { provides: _, ...rest } = minimal
    const result = pluginManifestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects invalid sandbox value', () => {
    const manifest = {
      ...minimal,
      provides: {
        tools: { entry: './src/index.ts', sandbox: 'invalid' },
      },
    }
    const result = pluginManifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
  })
})

describe('normalizeProvidesEntries', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeProvidesEntries(undefined)).toEqual([])
  })

  it('wraps single entry in array', () => {
    const entry = { entry: './src/index.ts' }
    expect(normalizeProvidesEntries(entry)).toEqual([entry])
  })

  it('passes through array unchanged', () => {
    const entries = [{ entry: './src/a.ts' }, { entry: './src/b.ts' }]
    expect(normalizeProvidesEntries(entries)).toEqual(entries)
  })
})
