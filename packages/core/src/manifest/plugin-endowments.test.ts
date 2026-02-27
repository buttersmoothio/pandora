import { describe, expect, it } from 'vitest'
import { buildPluginEndowments } from './plugin-endowments'

describe('buildPluginEndowments', () => {
  it('always provides web-platform globals', () => {
    const globals = buildPluginEndowments({}, {})

    expect(globals.console).toBeDefined()
    expect(globals.URL).toBe(URL)
    expect(globals.URLSearchParams).toBe(URLSearchParams)
    expect(globals.TextEncoder).toBe(TextEncoder)
    expect(globals.TextDecoder).toBe(TextDecoder)
    expect(globals.setTimeout).toBe(setTimeout)
    expect(globals.clearTimeout).toBe(clearTimeout)
    expect(globals.setInterval).toBe(setInterval)
    expect(globals.clearInterval).toBe(clearInterval)
    expect(globals.atob).toBe(atob)
    expect(globals.btoa).toBe(btoa)
    expect(globals.queueMicrotask).toBe(queueMicrotask)
    expect(globals.AbortController).toBe(AbortController)
    expect(globals.AbortSignal).toBe(AbortSignal)
  })

  it('does not provide Date/Intl without time permission', () => {
    const globals = buildPluginEndowments({}, {})
    expect(globals.Date).toBeUndefined()
    expect(globals.Intl).toBeUndefined()
  })

  it('provides Date/Intl with time permission', () => {
    const globals = buildPluginEndowments({ time: true }, {})
    expect(globals.Date).toBe(Date)
    expect(globals.Intl).toBe(Intl)
  })

  it('does not provide fetch without network permission', () => {
    const globals = buildPluginEndowments({}, {})
    expect(globals.fetch).toBeUndefined()
  })

  it('provides scoped fetch with network permission', () => {
    const globals = buildPluginEndowments({ network: ['example.com'] }, {})
    expect(globals.fetch).toBeTypeOf('function')
  })

  it('does not provide env without env permission', () => {
    const globals = buildPluginEndowments({}, { SECRET: 'value' })
    expect(globals.env).toBeUndefined()
  })

  it('provides scoped env with env permission', () => {
    const globals = buildPluginEndowments(
      { env: ['API_KEY'] },
      { API_KEY: 'abc', SECRET: 'hidden' },
    )
    const env = globals.env as { get: (key: string) => string | undefined }
    expect(env.get('API_KEY')).toBe('abc')
    expect(env.get('SECRET')).toBeUndefined()
  })

  it('does not provide Math.random without random permission', () => {
    const globals = buildPluginEndowments({}, {})
    expect(globals.Math).toBeUndefined()
  })

  it('provides Math.random with random permission', () => {
    const globals = buildPluginEndowments({ random: true }, {})
    const math = globals.Math as { random: () => number }
    expect(math.random).toBeTypeOf('function')
    expect(math.random()).toBeGreaterThanOrEqual(0)
    expect(math.random()).toBeLessThan(1)
  })

  it('provides readFile with fs permission', () => {
    const globals = buildPluginEndowments({ fs: ['/tmp'] }, {})
    expect(globals.readFile).toBeTypeOf('function')
  })

  it('returns a hardened object', () => {
    const globals = buildPluginEndowments({}, {})
    expect(Object.isFrozen(globals)).toBe(true)
  })
})
