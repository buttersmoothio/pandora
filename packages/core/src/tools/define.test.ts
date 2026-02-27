import { describe, expect, it } from 'vitest'
import {
  bindToolExport,
  buildManifest,
  clearManifestRegistry,
  getAllManifests,
  getManifest,
  getManifests,
  registerManifest,
} from './define'
import type { ToolExport } from './types'
import { DEFAULT_TOOL_TIMEOUT } from './types'

const defaultEnv = {}
const defaultConfig = { enabled: true }

function makeTestExport(overrides?: Partial<ToolExport>): ToolExport {
  return {
    id: 'test-tool',
    name: 'Test Tool',
    description: 'A test tool',
    parameters: {
      type: 'object',
      properties: { value: { type: 'string' } },
    },
    execute: async (input: { value: string }) => ({ echo: input.value }),
    ...overrides,
  }
}

describe('bindToolExport', () => {
  it('returns a Mastra Tool with correct id and description', () => {
    const exp = makeTestExport()
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    expect(tool.id).toBe('test-tool')
    expect(tool.description).toBe('A test tool')
  })

  it('execute function works', async () => {
    const exp = makeTestExport()
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    const result = await tool.execute?.({ value: 'hello' }, {} as never)
    expect(result).toEqual({ echo: 'hello' })
  })

  it('passes env to execute context', async () => {
    const exp = makeTestExport({
      execute: async (_input: unknown, ctx: { env: Record<string, string | undefined> }) => ({
        gotEnv: ctx.env.MY_KEY,
      }),
    })
    const tool = bindToolExport(exp, { MY_KEY: 'secret' }, defaultConfig)
    const result = await tool.execute?.({ value: '' }, {} as never)
    expect(result).toEqual({ gotEnv: 'secret' })
  })

  it('passes annotations through to Mastra mcp', () => {
    const annotations = { readOnlyHint: true, destructiveHint: false }
    const exp = makeTestExport({ annotations })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    expect(tool.mcp?.annotations).toEqual(annotations)
  })

  it('omits mcp when no annotations', () => {
    const exp = makeTestExport()
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    expect(tool.mcp).toBeUndefined()
  })

  it('rejects with timeout error when execute exceeds timeout', async () => {
    const exp = makeTestExport({
      id: 'slow-tool',
      timeout: 50,
      execute: async () => {
        await new Promise((r) => setTimeout(r, 200))
        return { echo: 'done' }
      },
    })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    await expect(tool.execute?.({ value: 'hi' }, {} as never)).rejects.toThrow(
      "Tool 'slow-tool' timed out after 50ms",
    )
  })

  it('resolves normally when execute completes within timeout', async () => {
    const exp = makeTestExport({
      id: 'fast-tool',
      timeout: 1_000,
    })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    const result = await tool.execute?.({ value: 'hi' }, {} as never)
    expect(result).toEqual({ echo: 'hi' })
  })

  it('handles ToolExport with no parameters (empty schema)', async () => {
    const exp = makeTestExport({ parameters: undefined })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)
    expect(tool.id).toBe('test-tool')
  })
})

describe('buildManifest', () => {
  it('builds a manifest from a ToolExport', () => {
    const exp = makeTestExport()
    const manifest = buildManifest(exp)
    expect(manifest).toEqual({
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      permissions: undefined,
      sandbox: 'compartment',
      annotations: undefined,
      timeout: DEFAULT_TOOL_TIMEOUT,
    })
  })

  it('includes annotations when present', () => {
    const annotations = { readOnlyHint: true }
    const exp = makeTestExport({ annotations })
    const manifest = buildManifest(exp)
    expect(manifest.annotations).toEqual(annotations)
  })

  it('uses custom timeout when specified', () => {
    const exp = makeTestExport({ timeout: 5_000 })
    const manifest = buildManifest(exp)
    expect(manifest.timeout).toBe(5_000)
  })

  it('defaults timeout to DEFAULT_TOOL_TIMEOUT', () => {
    const exp = makeTestExport()
    const manifest = buildManifest(exp)
    expect(manifest.timeout).toBe(DEFAULT_TOOL_TIMEOUT)
  })

  it('includes permissions from ToolExport', () => {
    const permissions = { network: ['api.example.com'], env: ['API_KEY'] }
    const exp = makeTestExport({ permissions })
    const manifest = buildManifest(exp)
    expect(manifest.permissions).toEqual(permissions)
  })

  it('uses sandbox from ToolExport', () => {
    const exp = makeTestExport({ sandbox: 'host' })
    const manifest = buildManifest(exp)
    expect(manifest.sandbox).toBe('host')
  })
})

describe('getManifest', () => {
  it('returns manifest by tool ID string', () => {
    clearManifestRegistry()
    const exp = makeTestExport()
    registerManifest(buildManifest(exp))
    const manifest = getManifest('test-tool')
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('test-tool')
  })

  it('returns manifest by object with id', () => {
    clearManifestRegistry()
    const exp = makeTestExport()
    registerManifest(buildManifest(exp))
    const manifest = getManifest({ id: 'test-tool' })
    expect(manifest?.id).toBe('test-tool')
  })

  it('returns undefined for unregistered tools', () => {
    expect(getManifest('nonexistent')).toBeUndefined()
  })
})

describe('getManifests', () => {
  it('returns all manifests for a ToolRecord', () => {
    clearManifestRegistry()
    const expA = makeTestExport({ id: 'tool-a', name: 'Tool A', description: 'Tool A' })
    const expB = makeTestExport({ id: 'tool-b', name: 'Tool B', description: 'Tool B' })
    registerManifest(buildManifest(expA))
    registerManifest(buildManifest(expB))

    const toolA = bindToolExport(expA, defaultEnv, defaultConfig)
    const toolB = bindToolExport(expB, defaultEnv, defaultConfig)

    const manifests = getManifests({ 'tool-a': toolA, 'tool-b': toolB })
    expect(Object.keys(manifests)).toEqual(['tool-a', 'tool-b'])
  })

  it('skips tools without manifests', () => {
    clearManifestRegistry()
    const exp = makeTestExport()
    registerManifest(buildManifest(exp))
    const tool = bindToolExport(exp, defaultEnv, defaultConfig)

    const { createTool } = require('@mastra/core/tools')
    const rawTool = createTool({
      id: 'raw',
      description: 'Raw',
      inputSchema: require('zod').z.object({}),
      execute: async () => ({}),
    })

    const manifests = getManifests({ raw: rawTool, 'test-tool': tool })
    expect(Object.keys(manifests)).toEqual(['test-tool'])
  })
})

describe('getAllManifests', () => {
  it('returns all registered manifests keyed by id', () => {
    clearManifestRegistry()
    const expA = makeTestExport({ id: 'all-a', name: 'A', description: 'A' })
    const expB = makeTestExport({ id: 'all-b', name: 'B', description: 'B' })
    registerManifest(buildManifest(expA))
    registerManifest(buildManifest(expB))

    const all = getAllManifests()
    expect(all['all-a']).toBeDefined()
    expect(all['all-a'].description).toBe('A')
    expect(all['all-b']).toBeDefined()
  })
})
