import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validatePluginConfig } from './config-validate'
import type { RegisteredPlugin } from './plugin-registry'

function makePlugin(overrides?: Partial<RegisteredPlugin>): RegisteredPlugin {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    envVars: [],
    configFields: [],
    ...overrides,
  }
}

describe('validatePluginConfig', () => {
  it('returns enabled config when no schema and no raw config', () => {
    const plugin = makePlugin()
    const result = validatePluginConfig(plugin, undefined)
    expect(result.config).toEqual({ enabled: true })
    expect(result.errors).toEqual([])
  })

  it('returns null when explicitly disabled', () => {
    const plugin = makePlugin()
    const result = validatePluginConfig(plugin, { enabled: false })
    expect(result.config).toBeNull()
    expect(result.errors).toEqual([])
  })

  it('validates raw config against schema', () => {
    const plugin = makePlugin({
      schema: z.object({ apiKey: z.string() }),
    })
    const result = validatePluginConfig(plugin, { enabled: true, apiKey: 'test' })
    expect(result.config).toEqual({ enabled: true, apiKey: 'test' })
    expect(result.errors).toEqual([])
  })

  it('returns null with errors for invalid config', () => {
    const plugin = makePlugin({
      schema: z.object({ apiKey: z.string() }),
    })
    const result = validatePluginConfig(plugin, { enabled: true, apiKey: 123 as unknown as string })
    expect(result.config).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('skips unconfigured plugin with required schema fields', () => {
    const plugin = makePlugin({
      schema: z.object({ apiKey: z.string() }),
    })
    const result = validatePluginConfig(plugin, undefined)
    expect(result.config).toBeNull()
    expect(result.errors).toEqual([])
  })

  it('uses schema defaults when no raw config', () => {
    const plugin = makePlugin({
      schema: z.object({ mode: z.string().default('auto') }),
    })
    const result = validatePluginConfig(plugin, undefined)
    expect(result.config).toBeDefined()
    expect((result.config as Record<string, unknown>)?.mode).toBe('auto')
  })
})
