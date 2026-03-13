import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createRateLimiter } from '../rate-limit'

const delay = (ms: number): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, ms))

describe('createRateLimiter', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
  })

  it('allows requests under the limit', async () => {
    app.use('*', createRateLimiter({ max: 3, windowMs: 60_000 }))
    app.get('/', (c) => c.json({ ok: true }))

    const res1 = await app.request('/')
    expect(res1.status).toBe(200)
    expect(res1.headers.get('X-RateLimit-Limit')).toBe('3')
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('2')

    const res2 = await app.request('/')
    expect(res2.status).toBe(200)
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('1')

    const res3 = await app.request('/')
    expect(res3.status).toBe(200)
    expect(res3.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('returns 429 when limit is exceeded', async () => {
    app.use('*', createRateLimiter({ max: 2, windowMs: 60_000 }))
    app.get('/', (c) => c.json({ ok: true }))

    await app.request('/')
    await app.request('/')
    const res = await app.request('/')
    expect(res.status).toBe(429)

    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('too_many_requests')
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('resets after window expires', async () => {
    app.use('*', createRateLimiter({ max: 1, windowMs: 100 }))
    app.get('/', (c) => c.json({ ok: true }))

    const res1 = await app.request('/')
    expect(res1.status).toBe(200)

    const res2 = await app.request('/')
    expect(res2.status).toBe(429)

    // Wait for window to expire
    await delay(150)

    const res3 = await app.request('/')
    expect(res3.status).toBe(200)
  })

  it('tracks IPs independently', async () => {
    app.use('*', createRateLimiter({ max: 1, windowMs: 60_000 }))
    app.get('/', (c) => c.json({ ok: true }))

    // First IP
    const res1 = await app.request('/', {
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    })
    expect(res1.status).toBe(200)

    // Same IP — should be blocked
    const res2 = await app.request('/', {
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    })
    expect(res2.status).toBe(429)

    // Different IP — should pass
    const res3 = await app.request('/', {
      headers: { 'X-Forwarded-For': '5.6.7.8' },
    })
    expect(res3.status).toBe(200)
  })

  it('uses X-Real-IP when X-Forwarded-For is absent', async () => {
    app.use('*', createRateLimiter({ max: 1, windowMs: 60_000 }))
    app.get('/', (c) => c.json({ ok: true }))

    const res1 = await app.request('/', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    })
    expect(res1.status).toBe(200)

    const res2 = await app.request('/', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    })
    expect(res2.status).toBe(429)
  })

  it('takes first IP from X-Forwarded-For chain', async () => {
    app.use('*', createRateLimiter({ max: 1, windowMs: 60_000 }))
    app.get('/', (c) => c.json({ ok: true }))

    const res1 = await app.request('/', {
      headers: { 'X-Forwarded-For': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
    })
    expect(res1.status).toBe(200)

    // Same client IP in the chain — blocked
    const res2 = await app.request('/', {
      headers: { 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' },
    })
    expect(res2.status).toBe(429)
  })
})
