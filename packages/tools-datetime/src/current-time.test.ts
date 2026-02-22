import { getManifest, getManifests } from '@pandora/core/tools'
import { describe, expect, it } from 'vitest'
import { currentTime } from './current-time'
import plugin from './index'

describe('current-time tool', () => {
  const tool = currentTime({}, { enabled: true })

  it('returns ISO timestamp', async () => {
    const result = (await tool.execute?.({ timezone: undefined }, {} as never)) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.timezone).toBe('UTC')
  })

  it('accepts a timezone', async () => {
    const result = (await tool.execute?.({ timezone: 'America/New_York' }, {} as never)) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.timezone).toBe('America/New_York')
    expect(result.iso).toBeDefined()
  })

  it('falls back to UTC for invalid timezone', async () => {
    const result = (await tool.execute?.({ timezone: 'Invalid/Zone' }, {} as never)) as {
      iso: string
      formatted: string
      timezone: string
    }
    expect(result.timezone).toBe('UTC')
  })

  it('has a manifest with sandbox: host and no permissions', () => {
    const manifest = getManifest(currentTime)
    expect(manifest).toBeDefined()
    expect(manifest?.sandbox).toBe('host')
    expect(manifest?.permissions).toBeUndefined()
  })

  it('has MCP annotations', () => {
    const manifest = getManifest(currentTime)
    expect(manifest?.annotations?.readOnlyHint).toBe(true)
    expect(manifest?.annotations?.destructiveHint).toBe(false)
    expect(manifest?.annotations?.idempotentHint).toBe(true)
  })
})

describe('plugin descriptor', () => {
  it('has the expected id and schema version', () => {
    expect(plugin.id).toBe('tools-datetime')
    expect(plugin.schemaVersion).toBe(1)
  })

  it('factory returns a tool record containing current-time', () => {
    const tools = plugin.factory({}, { enabled: true })
    expect(Object.keys(tools)).toEqual(['current-time'])
  })

  it('factory returns manifests for all tools', () => {
    const tools = plugin.factory({}, { enabled: true })
    const manifests = getManifests(tools)
    expect(manifests['current-time']).toBeDefined()
    expect(manifests['current-time'].id).toBe('current-time')
  })
})
