import { describe, expect, it } from 'vitest'
import type { Config } from '../config'
import { DEFAULTS } from '../config'
import { loadBuiltinTools } from './builtin'

describe('loadBuiltinTools', () => {
  it('loads all tools with default config', () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    expect(Object.keys(tools)).toContain('current-time')
  })

  it('filters by enabled list', () => {
    const config: Config = {
      ...DEFAULTS,
      tools: { ...DEFAULTS.tools, enabled: ['current-time'] },
    }
    const tools = loadBuiltinTools(config, {})
    expect(Object.keys(tools)).toEqual(['current-time'])
  })

  it('excludes unknown tools from enabled list', () => {
    const config: Config = {
      ...DEFAULTS,
      tools: { ...DEFAULTS.tools, enabled: ['nonexistent'] },
    }
    const tools = loadBuiltinTools(config, {})
    expect(Object.keys(tools)).toEqual([])
  })

  it('filters by disabled list', () => {
    const config: Config = {
      ...DEFAULTS,
      tools: { ...DEFAULTS.tools, disabled: ['current-time'] },
    }
    const tools = loadBuiltinTools(config, {})
    expect(Object.keys(tools)).not.toContain('current-time')
  })
})

describe('current-time tool', () => {
  it('returns ISO timestamp', async () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    const tool = tools['current-time']
    const result = (await tool.execute?.({ timezone: undefined }, {} as never)) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.timezone).toBe('UTC')
  })

  it('accepts a timezone', async () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    const tool = tools['current-time']
    const result = (await tool.execute?.({ timezone: 'America/New_York' }, {} as never)) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.timezone).toBe('America/New_York')
    expect(result.iso).toBeDefined()
  })

  it('falls back to UTC for invalid timezone', async () => {
    const tools = loadBuiltinTools(DEFAULTS, {})
    const tool = tools['current-time']
    const result = (await tool.execute?.({ timezone: 'Invalid/Zone' }, {} as never)) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.timezone).toBe('UTC')
  })
})
