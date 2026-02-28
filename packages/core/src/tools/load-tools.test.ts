import { tools as datetimeTools } from '@pandora/tools-datetime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../config'
import { getManifest } from './define'
import { clearToolPlugins, getPluginAlerts, loadTools, registerToolPlugin } from './index'
import type { ToolExport, ToolPlugin } from './types'

const datetime: ToolPlugin = {
  id: 'tools-datetime',
  name: 'Date & Time',
  schemaVersion: 1,
  tools: datetimeTools,
}

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

describe('loadTools with resolveTools hook', () => {
  afterEach(() => {
    clearToolPlugins()
  })

  it('calls resolveTools hook and includes resolved tools', async () => {
    const searchExport: ToolExport = {
      id: 'web_search',
      name: 'Web Search',
      description: 'Search the web',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
      execute: async () => [],
    }
    const dynamicPlugin: ToolPlugin = {
      id: 'dynamic-test',
      name: 'Dynamic Test',
      schemaVersion: 1,
      tools: [],
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('web_search')
    expect(dynamicPlugin.resolveTools).toHaveBeenCalledOnce()
  })

  it('resolved tools get manifests via registerManifest', async () => {
    const searchExport: ToolExport = {
      id: 'web_search',
      name: 'Web Search',
      description: 'Search the web',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
      execute: async () => [],
    }
    const dynamicPlugin: ToolPlugin = {
      id: 'manifest-test',
      name: 'Manifest Test',
      schemaVersion: 1,
      tools: [],
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    await loadTools(DEFAULTS, {})
    const manifest = getManifest('web_search')
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('web_search')
    expect(manifest?.name).toBe('Web Search')
  })

  it('skips resolveTools when plugin is disabled', async () => {
    const resolveToolsFn = vi.fn(async () => ({ tools: [] }))
    const dynamicPlugin: ToolPlugin = {
      id: 'dynamic-disabled',
      name: 'Disabled Dynamic',
      schemaVersion: 1,
      configFields: [{ key: 'foo', label: 'Foo', type: 'text' }],
      tools: [],
      resolveTools: resolveToolsFn,
    }
    registerToolPlugin(dynamicPlugin)

    const config = {
      ...DEFAULTS,
      toolPlugins: { 'dynamic-disabled': { enabled: false } },
    }
    await loadTools(config, {})
    expect(resolveToolsFn).not.toHaveBeenCalled()
  })

  it('merges static and resolved tools', async () => {
    registerToolPlugin(datetime)
    const searchExport: ToolExport = {
      id: 'extra_tool',
      name: 'Extra',
      description: 'Extra tool',
      execute: async () => ({}),
    }
    const dynamicPlugin: ToolPlugin = {
      id: 'dynamic-merge',
      name: 'Merge Test',
      schemaVersion: 1,
      tools: [],
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('current-time')
    expect(Object.keys(tools)).toContain('extra_tool')
  })

  it('loads plugin with only optional configFields without explicit config', async () => {
    const searchExport: ToolExport = {
      id: 'search_tool',
      name: 'Search',
      description: 'Search tool',
      execute: async () => ({}),
    }
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
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('search_tool')
    expect(dynamicPlugin.resolveTools).toHaveBeenCalledOnce()
  })
})

describe('loadTools with alerts', () => {
  afterEach(() => {
    clearToolPlugins()
  })

  it('stores alerts from resolveTools returning { tools, alerts }', async () => {
    const searchExport: ToolExport = {
      id: 'my_tool',
      name: 'My Tool',
      description: 'Test tool',
      execute: async () => ({}),
    }
    const dynamicPlugin: ToolPlugin = {
      id: 'alert-plugin',
      name: 'Alert Test',
      schemaVersion: 1,
      tools: [],
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
        alerts: [{ level: 'info' as const, message: 'Using test search' }],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('my_tool')
    expect(getPluginAlerts('alert-plugin')).toEqual([
      { level: 'info', message: 'Using test search' },
    ])
  })

  it('stores no alerts when resolveTools returns tools without alerts', async () => {
    const searchExport: ToolExport = {
      id: 'my_tool',
      name: 'My Tool',
      description: 'Test tool',
      execute: async () => ({}),
    }
    const dynamicPlugin: ToolPlugin = {
      id: 'no-alert-plugin',
      name: 'No Alert',
      schemaVersion: 1,
      tools: [],
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    await loadTools(DEFAULTS, {})
    expect(getPluginAlerts('no-alert-plugin')).toEqual([])
  })

  it('clears alerts on reload', async () => {
    const searchExport: ToolExport = {
      id: 'my_tool',
      name: 'My Tool',
      description: 'Test tool',
      execute: async () => ({}),
    }
    const dynamicPlugin: ToolPlugin = {
      id: 'clear-alert-plugin',
      name: 'Clear Alert',
      schemaVersion: 1,
      tools: [],
      resolveTools: vi.fn(async () => ({
        tools: [searchExport],
        alerts: [{ level: 'warning' as const, message: 'test warning' }],
      })),
    }
    registerToolPlugin(dynamicPlugin)

    await loadTools(DEFAULTS, {})
    expect(getPluginAlerts('clear-alert-plugin')).toHaveLength(1)

    // Reload with no alerts
    dynamicPlugin.resolveTools = vi.fn(async () => ({ tools: [] }))
    await loadTools(DEFAULTS, {})
    expect(getPluginAlerts('clear-alert-plugin')).toEqual([])
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
