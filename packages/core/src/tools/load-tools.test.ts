import datetime from '@pandora/tools-datetime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config'
import { DEFAULTS } from '../config'
import { getManifest } from './define'
import { clearToolPlugins, loadTools, registerToolPlugin } from './index'

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
    const tools = await loadTools(DEFAULTS, {})
    const manifest = getManifest(tools['current-time'])
    expect(manifest).toBeDefined()
    expect(manifest?.id).toBe('current-time')
  })

  it('returns empty when no packages registered', async () => {
    clearToolPlugins()
    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toHaveLength(0)
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
