import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validatePluginConfig } from '../config-validate'
import type { RegisteredPlugin } from '../plugin-registry'

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
  it('returns null when no raw config provided', () => {
    const plugin = makePlugin()
    const result = validatePluginConfig(plugin, undefined)
    expect(result.config).toBeNull()
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
    // @ts-expect-error testing validation with wrong type (number instead of string)
    const result = validatePluginConfig(plugin, { enabled: true, apiKey: 123 })
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

  it('returns null when no raw config even with schema defaults', () => {
    const plugin = makePlugin({
      schema: z.object({ mode: z.string().default('auto') }),
    })
    const result = validatePluginConfig(plugin, undefined)
    expect(result.config).toBeNull()
    expect(result.errors).toEqual([])
  })
})
