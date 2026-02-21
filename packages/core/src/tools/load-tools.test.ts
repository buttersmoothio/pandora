import { describe, expect, it } from 'vitest'
import type { Config } from '../config'
import { DEFAULTS } from '../config'
import { getManifest } from './define'
import { loadTools } from './index'

describe('loadTools', () => {
  it('loads tools from stdlib packages', async () => {
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
})
