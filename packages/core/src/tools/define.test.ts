import type { Tool } from '@pandorakit/sdk/tools'
import { describe, expect, it } from 'vitest'
import { bindTool, buildManifest } from './define'
import { DEFAULT_TOOL_TIMEOUT } from './types'

const defaultEnv = {}
const defaultConfig = { enabled: true }

function makeTestTool(overrides?: Partial<Tool>): Tool {
  return {
    id: 'test-tool',
    name: 'Test Tool',
    description: 'A test tool',
    parameters: {
      type: 'object',
      properties: { value: { type: 'string' } },
    },
    annotations: { readOnlyHint: true },
    // biome-ignore lint/nursery/useExplicitType: input type inferred from Tool interface
    execute: async (input): Promise<{ echo: string }> => ({
      echo: (input as { value: string }).value,
    }),
    ...overrides,
  }
}

describe('bindTool', () => {
  it('returns a Mastra Tool with correct id and description', () => {
    const def = makeTestTool()
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    expect(tool.id).toBe('test-plugin:test-tool')
    expect(tool.description).toBe('A test tool')
  })

  it('execute function works', async () => {
    const def = makeTestTool()
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    const result = await tool.execute?.({ value: 'hello' }, {} as never)
    expect(result).toEqual({ echo: 'hello' })
  })

  it('passes env to execute context', async () => {
    const def = makeTestTool({
      execute: async (_input: unknown, ctx: { env: Record<string, string | undefined> }) => ({
        gotEnv: ctx.env.MY_KEY,
      }),
    })
    const tool = bindTool(def, { MY_KEY: 'secret' }, defaultConfig, `test-plugin:${def.id}`)
    const result = await tool.execute?.({ value: '' }, {} as never)
    expect(result).toEqual({ gotEnv: 'secret' })
  })

  it('passes logger to execute context', async () => {
    const def = makeTestTool({
      execute: async (
        _input: unknown,
        ctx: { logger: { log: unknown; warn: unknown; error: unknown } },
      ) => ({
        hasLog: typeof ctx.logger.log === 'function',
        hasWarn: typeof ctx.logger.warn === 'function',
        hasError: typeof ctx.logger.error === 'function',
      }),
    })
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    const result = await tool.execute?.({ value: '' }, {} as never)
    expect(result).toEqual({ hasLog: true, hasWarn: true, hasError: true })
  })

  it('passes annotations through to Mastra mcp', () => {
    const annotations = { readOnlyHint: true, destructiveHint: false }
    const def = makeTestTool({ annotations })
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    expect(tool.mcp?.annotations).toEqual(annotations)
  })

  it('always sets mcp annotations', () => {
    const def = makeTestTool()
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    expect(tool.mcp?.annotations).toEqual({ readOnlyHint: true })
  })

  it('rejects with timeout error when execute exceeds timeout', async () => {
    const def = makeTestTool({
      id: 'slow-tool',
      timeout: 50,
      execute: async () => {
        await new Promise((r) => setTimeout(r, 200))
        return { echo: 'done' }
      },
    })
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    await expect(tool.execute?.({ value: 'hi' }, {} as never)).rejects.toThrow(
      "Tool 'test-plugin:slow-tool' timed out after 50ms",
    )
  })

  it('resolves normally when execute completes within timeout', async () => {
    const def = makeTestTool({
      id: 'fast-tool',
      timeout: 1_000,
    })
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    const result = await tool.execute?.({ value: 'hi' }, {} as never)
    expect(result).toEqual({ echo: 'hi' })
  })

  it('handles Tool with no parameters (empty schema)', async () => {
    const def = makeTestTool({ parameters: undefined })
    const tool = bindTool(def, defaultEnv, defaultConfig, `test-plugin:${def.id}`)
    expect(tool.id).toBe('test-plugin:test-tool')
  })
})

describe('buildManifest', () => {
  it('builds a manifest from a Tool definition', () => {
    const def = makeTestTool()
    const manifest = buildManifest(def)
    expect(manifest).toEqual({
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      permissions: undefined,
      sandbox: 'compartment',
      annotations: { readOnlyHint: true },
      timeout: DEFAULT_TOOL_TIMEOUT,
    })
  })

  it('includes annotations when present', () => {
    const annotations = { readOnlyHint: true }
    const def = makeTestTool({ annotations })
    const manifest = buildManifest(def)
    expect(manifest.annotations).toEqual(annotations)
  })

  it('uses custom timeout when specified', () => {
    const def = makeTestTool({ timeout: 5_000 })
    const manifest = buildManifest(def)
    expect(manifest.timeout).toBe(5_000)
  })

  it('defaults timeout to DEFAULT_TOOL_TIMEOUT', () => {
    const def = makeTestTool()
    const manifest = buildManifest(def)
    expect(manifest.timeout).toBe(DEFAULT_TOOL_TIMEOUT)
  })

  it('includes permissions from Tool definition', () => {
    const permissions = { network: ['api.example.com'], env: ['API_KEY'] }
    const def = makeTestTool({ permissions })
    const manifest = buildManifest(def)
    expect(manifest.permissions).toEqual(permissions)
  })

  it('uses sandbox from Tool definition', () => {
    const def = makeTestTool({ sandbox: 'host' })
    const manifest = buildManifest(def)
    expect(manifest.sandbox).toBe('host')
  })
})
