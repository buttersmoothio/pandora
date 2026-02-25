import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTool, getAllManifests, getManifest, getManifests } from './define'
import { DEFAULT_TOOL_TIMEOUT } from './types'

const testSchema = z.object({ value: z.string() })
const defaultEnv = {}
const defaultConfig = { enabled: true }

function makeTestTool(overrides?: Record<string, unknown>) {
  return defineTool({
    id: 'test-tool',
    name: 'Test Tool',
    description: 'A test tool',
    inputSchema: testSchema,
    execute: async (input) => ({ echo: input.value }),
    ...overrides,
  })
}

describe('defineTool', () => {
  it('returns a definition with the correct id', () => {
    const def = makeTestTool()
    expect(def.id).toBe('test-tool')
  })

  it('creates a Mastra Tool with correct id and description when called', () => {
    const tool = makeTestTool()(defaultEnv, defaultConfig)
    expect(tool.id).toBe('test-tool')
    expect(tool.description).toBe('A test tool')
  })

  it('tool execute function works', async () => {
    const tool = makeTestTool()(defaultEnv, defaultConfig)
    const result = await tool.execute?.({ value: 'hello' }, {} as never)
    expect(result).toEqual({ echo: 'hello' })
  })

  it('passes env and config to execute context', async () => {
    const def = defineTool({
      id: 'ctx-tool',
      name: 'Ctx Tool',
      description: 'Test context',
      inputSchema: testSchema,
      execute: async (_input, ctx) => ({ gotEnv: ctx.env.MY_KEY, gotConfig: ctx.config.enabled }),
    })
    const tool = def({ MY_KEY: 'secret' }, { enabled: true })
    const result = await tool.execute?.({ value: '' }, {} as never)
    expect(result).toEqual({ gotEnv: 'secret', gotConfig: true })
  })

  it('defaults sandbox to compartment', () => {
    const def = makeTestTool()
    const manifest = getManifest(def)
    expect(manifest?.sandbox).toBe('compartment')
  })

  it('sets sandbox to host when specified', () => {
    const def = makeTestTool({ sandbox: 'host' })
    const manifest = getManifest(def)
    expect(manifest?.sandbox).toBe('host')
  })

  it('omits permissions from manifest when not provided', () => {
    const def = makeTestTool()
    const manifest = getManifest(def)
    expect(manifest?.permissions).toBeUndefined()
  })

  it('passes permissions through to manifest when provided', () => {
    const permissions = { time: true, network: ['api.example.com'], env: ['API_KEY'] }
    const def = makeTestTool({ permissions })
    const manifest = getManifest(def)
    expect(manifest?.permissions).toEqual(permissions)
  })

  it('passes annotations through to manifest and Mastra mcp', () => {
    const annotations = { readOnlyHint: true, destructiveHint: false }
    const def = makeTestTool({ annotations })
    const manifest = getManifest(def)
    expect(manifest?.annotations).toEqual(annotations)

    const tool = def(defaultEnv, defaultConfig)
    expect(tool.mcp?.annotations).toEqual(annotations)
  })

  it('omits mcp when no annotations', () => {
    const tool = makeTestTool()(defaultEnv, defaultConfig)
    expect(tool.mcp).toBeUndefined()
  })

  it('passes requireApproval through to Mastra tool', () => {
    const tool = makeTestTool({ requireApproval: true })(defaultEnv, defaultConfig)
    expect(tool.requireApproval).toBe(true)
  })

  it('defaults timeout to DEFAULT_TOOL_TIMEOUT in manifest', () => {
    const def = makeTestTool()
    const manifest = getManifest(def)
    expect(manifest?.timeout).toBe(DEFAULT_TOOL_TIMEOUT)
  })

  it('sets custom timeout in manifest when specified', () => {
    const def = makeTestTool({ timeout: 5_000 })
    const manifest = getManifest(def)
    expect(manifest?.timeout).toBe(5_000)
  })

  it('rejects with timeout error when execute exceeds timeout', async () => {
    const def = defineTool({
      id: 'slow-tool',
      name: 'Slow Tool',
      description: 'Takes too long',
      inputSchema: testSchema,
      timeout: 50,
      execute: async () => {
        await new Promise((r) => setTimeout(r, 200))
        return { echo: 'done' }
      },
    })
    const tool = def(defaultEnv, defaultConfig)
    await expect(tool.execute?.({ value: 'hi' }, {} as never)).rejects.toThrow(
      "Tool 'slow-tool' timed out after 50ms",
    )
  })

  it('resolves normally when execute completes within timeout', async () => {
    const def = defineTool({
      id: 'fast-tool',
      name: 'Fast Tool',
      description: 'Quick',
      inputSchema: testSchema,
      timeout: 1_000,
      execute: async (input) => ({ echo: input.value }),
    })
    const tool = def(defaultEnv, defaultConfig)
    const result = await tool.execute?.({ value: 'hi' }, {} as never)
    expect(result).toEqual({ echo: 'hi' })
  })
})

describe('getManifest', () => {
  it('returns manifest for a tool definition', () => {
    const def = makeTestTool()
    const manifest = getManifest(def)
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('test-tool')
  })

  it('returns manifest by tool ID string', () => {
    makeTestTool() // registers manifest
    const manifest = getManifest('test-tool')
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('test-tool')
  })

  it('returns manifest for an instantiated tool', () => {
    const tool = makeTestTool()(defaultEnv, defaultConfig)
    const manifest = getManifest(tool)
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('test-tool')
  })

  it('returns undefined for tools not created via defineTool', () => {
    const { createTool } = require('@mastra/core/tools')
    const rawTool = createTool({
      id: 'raw-tool',
      description: 'Not a Pandora tool',
      inputSchema: testSchema,
      execute: async () => ({}),
    })
    expect(getManifest(rawTool)).toBeUndefined()
  })
})

describe('getManifests', () => {
  it('returns all manifests for a ToolRecord', () => {
    const tool1 = defineTool({
      id: 'tool-a',
      name: 'Tool A',
      description: 'Tool A',
      inputSchema: testSchema,
      permissions: { time: true },
      execute: async () => ({}),
    })(defaultEnv, defaultConfig)

    const tool2 = defineTool({
      id: 'tool-b',
      name: 'Tool B',
      description: 'Tool B',
      inputSchema: testSchema,
      permissions: { network: ['example.com'] },
      sandbox: 'host',
      execute: async () => ({}),
    })(defaultEnv, defaultConfig)

    const manifests = getManifests({ 'tool-a': tool1, 'tool-b': tool2 })
    expect(Object.keys(manifests)).toEqual(['tool-a', 'tool-b'])
    expect(manifests['tool-a'].permissions?.time).toBe(true)
    expect(manifests['tool-b'].sandbox).toBe('host')
  })

  it('skips tools without manifests', () => {
    const { createTool } = require('@mastra/core/tools')
    const rawTool = createTool({
      id: 'raw',
      description: 'Raw',
      inputSchema: testSchema,
      execute: async () => ({}),
    })
    const pandoraTool = makeTestTool()(defaultEnv, defaultConfig)

    // Key-based lookup: 'raw' has no manifest, 'test-tool' does
    const manifests = getManifests({ raw: rawTool, 'test-tool': pandoraTool })
    expect(Object.keys(manifests)).toEqual(['test-tool'])
  })
})

describe('getAllManifests', () => {
  it('returns all registered manifests keyed by id', () => {
    defineTool({
      id: 'all-test-a',
      name: 'Tool A',
      description: 'Tool A',
      inputSchema: testSchema,
      permissions: { time: true },
      execute: async () => ({}),
    })
    defineTool({
      id: 'all-test-b',
      name: 'Tool B',
      description: 'Tool B',
      inputSchema: testSchema,
      permissions: { random: true },
      sandbox: 'host',
      execute: async () => ({}),
    })

    const all = getAllManifests()
    expect(all['all-test-a']).toBeDefined()
    expect(all['all-test-a'].description).toBe('Tool A')
    expect(all['all-test-b']).toBeDefined()
    expect(all['all-test-b'].sandbox).toBe('host')
  })
})
