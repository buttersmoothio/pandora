import datetime from '@pandora/tools-datetime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('loads all tools from enabled plugins', async () => {
    const tools = await loadTools(DEFAULTS, {})
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

    const config = {
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

  it('loads plugin with only optional configFields without explicit config', async () => {
    const dynamicPlugin: ToolPlugin = {
      id: 'optional-config',
      name: 'Optional Config',
      schemaVersion: 1,
      configFields: [
        {
          key: 'searchBackend',
          label: 'Backend',
          type: 'enum',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'tavily', label: 'Tavily' },
          ],
        },
      ],
      tools: [],
      getTools: vi.fn(async () => ({
        search_tool: { type: 'search' } as never,
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('search_tool')
    expect(dynamicPlugin.getTools).toHaveBeenCalledOnce()
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
