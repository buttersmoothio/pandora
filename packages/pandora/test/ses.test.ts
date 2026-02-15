import { describe, expect, it } from 'vitest'

describe('SES lockdown', () => {
  it('freezes Array.prototype', () => {
    expect(Object.isFrozen(Array.prototype)).toBe(true)
  })

  it('freezes Object.prototype', () => {
    expect(Object.isFrozen(Object.prototype)).toBe(true)
  })

  it('prevents prototype pollution', () => {
    expect(() => {
      ;(Object.prototype as Record<string, unknown>).polluted = true
    }).toThrow()
  })
})

describe('Compartment isolation', () => {
  it('has no access to host globals', () => {
    const c = new Compartment({ __options__: true })
    expect(c.evaluate('typeof process')).toBe('undefined')
    expect(c.evaluate('typeof fetch')).toBe('undefined')
    expect(c.evaluate('typeof require')).toBe('undefined')
  })

  it('isolates globalThis between compartments', () => {
    const c1 = new Compartment({ __options__: true })
    const c2 = new Compartment({ __options__: true })
    c1.evaluate('globalThis.leaked = 42')
    expect(c2.evaluate('typeof leaked')).toBe('undefined')
    expect((globalThis as Record<string, unknown>).leaked).toBeUndefined()
  })
})
