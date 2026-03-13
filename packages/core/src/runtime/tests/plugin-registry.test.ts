import { describe, expect, it } from 'vitest'
import type { RegisteredPlugin } from '../plugin-registry'
import { createPluginRegistry } from '../plugin-registry'

describe('createPluginRegistry', () => {
  it('returns a registry with an empty plugins map', () => {
    const registry = createPluginRegistry()
    expect(registry.plugins).toBeInstanceOf(Map)
    expect(registry.plugins.size).toBe(0)
  })

  it('allows registering and retrieving plugins', () => {
    const registry = createPluginRegistry()
    const plugin: RegisteredPlugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      envVars: [],
      configFields: [],
    }
    registry.plugins.set(plugin.id, plugin)

    expect(registry.plugins.size).toBe(1)
    expect(registry.plugins.get('test-plugin')).toBe(plugin)
  })

  it('returns independent registries on each call', () => {
    const a = createPluginRegistry()
    const b = createPluginRegistry()
    a.plugins.set('x', { id: 'x', name: 'X', envVars: [], configFields: [] })

    expect(a.plugins.size).toBe(1)
    expect(b.plugins.size).toBe(0)
  })
})
