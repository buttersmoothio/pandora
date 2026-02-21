import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTool, getAllManifests, getManifest, getManifests } from './define'

const testSchema = z.object({ value: z.string() })

function makeTestTool(overrides?: Record<string, unknown>) {
  return defineTool({
    id: 'test-tool',
    description: 'A test tool',
    inputSchema: testSchema,
    permissions: {},
    execute: async (input) => ({ echo: input.value }),
    ...overrides,
  })
}

describe('defineTool', () => {
  it('creates a Mastra Tool with correct id and description', () => {
    const tool = makeTestTool()
    expect(tool.id).toBe('test-tool')
    expect(tool.description).toBe('A test tool')
  })

  it('tool execute function works', async () => {
    const tool = makeTestTool()
    const result = await tool.execute?.({ value: 'hello' }, {} as never)
    expect(result).toEqual({ echo: 'hello' })
  })

  it('defaults sandbox to compartment', () => {
    const tool = makeTestTool()
    const manifest = getManifest(tool)
    expect(manifest?.sandbox).toBe('compartment')
  })

  it('sets sandbox to host when specified', () => {
    const tool = makeTestTool({ sandbox: 'host' })
    const manifest = getManifest(tool)
    expect(manifest?.sandbox).toBe('host')
  })

  it('passes permissions through to manifest', () => {
    const permissions = { time: true, network: ['api.example.com'], env: ['API_KEY'] }
    const tool = makeTestTool({ permissions })
    const manifest = getManifest(tool)
    expect(manifest?.permissions).toEqual(permissions)
  })

  it('passes annotations through to manifest and Mastra mcp', () => {
    const annotations = { readOnlyHint: true, destructiveHint: false }
    const tool = makeTestTool({ annotations })
    const manifest = getManifest(tool)
    expect(manifest?.annotations).toEqual(annotations)
    expect(tool.mcp?.annotations).toEqual(annotations)
  })

  it('omits mcp when no annotations', () => {
    const tool = makeTestTool()
    expect(tool.mcp).toBeUndefined()
  })

  it('passes requireApproval through to Mastra tool', () => {
    const tool = makeTestTool({ requireApproval: true })
    expect(tool.requireApproval).toBe(true)
  })
})

describe('getManifest', () => {
  it('returns manifest for a defineTool-created tool', () => {
    const tool = makeTestTool()
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
      description: 'Tool A',
      inputSchema: testSchema,
      permissions: { time: true },
      execute: async () => ({}),
    })
    const tool2 = defineTool({
      id: 'tool-b',
      description: 'Tool B',
      inputSchema: testSchema,
      permissions: { network: ['example.com'] },
      sandbox: 'host',
      execute: async () => ({}),
    })

    const manifests = getManifests({ 'tool-a': tool1, 'tool-b': tool2 })
    expect(Object.keys(manifests)).toEqual(['tool-a', 'tool-b'])
    expect(manifests['tool-a'].permissions.time).toBe(true)
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
    const pandoraTool = makeTestTool()

    const manifests = getManifests({ raw: rawTool, pandora: pandoraTool })
    expect(Object.keys(manifests)).toEqual(['pandora'])
  })
})

describe('getAllManifests', () => {
  it('returns all registered manifests keyed by id', () => {
    defineTool({
      id: 'all-test-a',
      description: 'Tool A',
      inputSchema: testSchema,
      permissions: { time: true },
      execute: async () => ({}),
    })
    defineTool({
      id: 'all-test-b',
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
