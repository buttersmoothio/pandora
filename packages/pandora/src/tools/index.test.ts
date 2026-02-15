import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../config'
import { loadTools } from './index'

describe('loadTools', () => {
  it('returns built-in tools', async () => {
    const tools = await loadTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('current-time')
  })

  it('respects disabled config', async () => {
    const config = {
      ...DEFAULTS,
      tools: { ...DEFAULTS.tools, disabled: ['current-time'] },
    }
    const tools = await loadTools(config, {})
    expect(Object.keys(tools)).not.toContain('current-time')
  })

  it('returns a plain object of tools', async () => {
    const tools = await loadTools(DEFAULTS, {})
    expect(typeof tools).toBe('object')
    for (const tool of Object.values(tools)) {
      expect(tool).toHaveProperty('id')
      expect(tool).toHaveProperty('description')
      expect(tool).toHaveProperty('execute')
    }
  })
})
