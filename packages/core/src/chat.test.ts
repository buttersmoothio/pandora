import { describe, expect, it } from 'vitest'
import { request } from './test-helpers'

describe('POST /api/chat validation', () => {
  it('returns 400 when messages is missing', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })

  it('returns 400 when messages is empty array', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })

  it('returns 400 when message has invalid role', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'system', content: 'hi' }],
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('role')
  })

  it('returns 400 when message is missing content', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user' }],
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('content')
  })

  it('returns 400 when messages is not an array', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: 'hello' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })
})
