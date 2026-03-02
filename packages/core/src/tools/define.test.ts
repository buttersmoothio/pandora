import { describe, expect, it } from 'vitest'
import { bindToolExport, buildManifest } from './define'
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
    execute: async (input) => ({ echo: (input as { value: string }).value }),
    ...overrides,
  }
}

describe('bindToolExport', () => {
  it('returns a Mastra Tool with correct id and description', () => {
    const exp = makeTestExport()
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    expect(tool.id).toBe('test-plugin:test-tool')
    expect(tool.description).toBe('A test tool')
  })

  it('execute function works', async () => {
    const exp = makeTestExport()
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    const result = await tool.execute?.({ value: 'hello' }, {} as never)
    expect(result).toEqual({ echo: 'hello' })
  })

  it('passes env to execute context', async () => {
    const exp = makeTestExport({
      execute: async (_input: unknown, ctx: { env: Record<string, string | undefined> }) => ({
        gotEnv: ctx.env.MY_KEY,
      }),
    })
    const tool = bindToolExport(exp, { MY_KEY: 'secret' }, defaultConfig, `test-plugin:${exp.id}`)
    const result = await tool.execute?.({ value: '' }, {} as never)
    expect(result).toEqual({ gotEnv: 'secret' })
  })

  it('passes logger to execute context', async () => {
    const exp = makeTestExport({
      execute: async (_input: unknown, ctx: { logger: Record<string, unknown> }) => ({
        hasLog: typeof ctx.logger.log === 'function',
        hasWarn: typeof ctx.logger.warn === 'function',
        hasError: typeof ctx.logger.error === 'function',
      }),
    })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    const result = await tool.execute?.({ value: '' }, {} as never)
    expect(result).toEqual({ hasLog: true, hasWarn: true, hasError: true })
  })

  it('passes annotations through to Mastra mcp', () => {
    const annotations = { readOnlyHint: true, destructiveHint: false }
    const exp = makeTestExport({ annotations })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    expect(tool.mcp?.annotations).toEqual(annotations)
  })

  it('omits mcp when no annotations', () => {
    const exp = makeTestExport()
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
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
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    await expect(tool.execute?.({ value: 'hi' }, {} as never)).rejects.toThrow(
      "Tool 'test-plugin:slow-tool' timed out after 50ms",
    )
  })

  it('resolves normally when execute completes within timeout', async () => {
    const exp = makeTestExport({
      id: 'fast-tool',
      timeout: 1_000,
    })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    const result = await tool.execute?.({ value: 'hi' }, {} as never)
    expect(result).toEqual({ echo: 'hi' })
  })

  it('handles ToolExport with no parameters (empty schema)', async () => {
    const exp = makeTestExport({ parameters: undefined })
    const tool = bindToolExport(exp, defaultEnv, defaultConfig, `test-plugin:${exp.id}`)
    expect(tool.id).toBe('test-plugin:test-tool')
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
