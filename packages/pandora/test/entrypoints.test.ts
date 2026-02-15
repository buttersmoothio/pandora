import { describe, expect, it } from 'vitest'

describe('Entry points', () => {
  it('serve.ts exports Bun server config', async () => {
    const serve = await import('../serve')
    expect(serve.default).toHaveProperty('port')
    expect(serve.default).toHaveProperty('fetch')
    expect(typeof serve.default.fetch).toBe('function')
  })

  it('worker.ts exports Hono app for Cloudflare', async () => {
    const worker = await import('../worker')
    expect(worker.default).toHaveProperty('fetch')
  })

  it('api/index.ts exports Vercel handlers', async () => {
    const vercel = await import('../api/index')
    expect(vercel.GET).toBeDefined()
    expect(vercel.POST).toBeDefined()
    expect(vercel.PUT).toBeDefined()
    expect(vercel.DELETE).toBeDefined()
    expect(vercel.PATCH).toBeDefined()
  })
})
