import datetime from '@pandora/tools-datetime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../config'
import { DEFAULTS } from '../config'
import { getManifest } from './define'
import { clearToolPlugins, loadTools, registerToolPlugin } from './index'
import type { ToolPlugin } from './types'

describe('loadTools', () => {
  beforeEach(() => {
    registerToolPlugin(datetime)
  })

  afterEach(() => {
    clearToolPlugins()
  })

  it('loads tools from registered packages', async () => {
    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('current-time')
  })

  it('excludes tools not listed in config', async () => {
    const config: Config = { ...DEFAULTS, tools: {} }
    const tools = await loadTools(config, {})
    expect(Object.keys(tools)).not.toContain('current-time')
  })

  it('excludes tools with enabled: false', async () => {
    const config: Config = {
      ...DEFAULTS,
      tools: { 'current-time': { enabled: false } },
    }
    const tools = await loadTools(config, {})
    expect(Object.keys(tools)).not.toContain('current-time')
  })

  it('keeps tools when enabled: true is set', async () => {
    const config: Config = {
      ...DEFAULTS,
      tools: { 'current-time': { enabled: true } },
    }
    const tools = await loadTools(config, {})
    expect(Object.keys(tools)).toContain('current-time')
  })

  it('loaded tools have manifests', async () => {
    await loadTools(DEFAULTS, {})
    const manifest = getManifest('current-time')
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('current-time')
  })

  it('returns empty when no packages registered', async () => {
    clearToolPlugins()
    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toHaveLength(0)
  })
})

describe('loadTools with getTools hook', () => {
  afterEach(() => {
    clearToolPlugins()
  })

  it('calls getTools hook and includes dynamic tools', async () => {
    const dynamicPlugin: ToolPlugin = {
      id: 'dynamic-test',
      name: 'Dynamic Test',
      schemaVersion: 1,
      tools: [],
      getTools: vi.fn(async () => ({
        my_dynamic_tool: { type: 'provider-tool' } as never,
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('my_dynamic_tool')
    expect(dynamicPlugin.getTools).toHaveBeenCalledOnce()
  })

  it('skips getTools when plugin is disabled', async () => {
    const getToolsFn = vi.fn(async () => ({ tool: {} as never }))
    const dynamicPlugin: ToolPlugin = {
      id: 'dynamic-disabled',
      name: 'Disabled Dynamic',
      schemaVersion: 1,
      configFields: [{ key: 'foo', label: 'Foo', type: 'text' }],
      tools: [],
      getTools: getToolsFn,
    }
    registerToolPlugin(dynamicPlugin)

    const config: Config = {
      ...DEFAULTS,
      toolPlugins: { 'dynamic-disabled': { enabled: false } },
    }
    await loadTools(config, {})
    expect(getToolsFn).not.toHaveBeenCalled()
  })

  it('merges static and dynamic tools', async () => {
    registerToolPlugin(datetime)
    const dynamicPlugin: ToolPlugin = {
      id: 'dynamic-merge',
      name: 'Merge Test',
      schemaVersion: 1,
      tools: [],
      getTools: vi.fn(async () => ({
        extra_tool: { type: 'extra' } as never,
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('current-time')
    expect(Object.keys(tools)).toContain('extra_tool')
  })
})

describe('registerToolPlugin', () => {
  afterEach(() => {
    clearToolPlugins()
  })

  it('rejects plugins with incompatible schema version', () => {
    expect(() =>
      registerToolPlugin({
        id: 'bad',
        name: 'Bad',
        schemaVersion: 99,
        envVars: [],
        tools: [],
      }),
    ).toThrow(/schema v99/)
  })
})
