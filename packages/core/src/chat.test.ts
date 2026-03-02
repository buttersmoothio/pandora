import { describe, expect, it } from 'vitest'
import { authRequest } from './test-helpers'

describe('POST /api/chat validation', () => {
  it('returns 400 when parts is missing', async () => {
    const res = await authRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })

  it('returns 400 when parts is empty array', async () => {
    const res = await authRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ parts: [] }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })

  it('returns 400 when parts is not an array', async () => {
    const res = await authRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ parts: 'hello' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })
})

describe('POST /api/chat/approve validation', () => {
  it('returns 400 when runId is missing', async () => {
    const res = await authRequest('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify({ threadId: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('runId and threadId are required')
  })

  it('returns 400 when threadId is missing', async () => {
    const res = await authRequest('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify({ runId: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('runId and threadId are required')
  })

  it('returns 400 when both runId and threadId are missing', async () => {
    const res = await authRequest('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify({ approved: true }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('runId and threadId are required')
  })
})

describe('GET /api/chat/:threadId/stream', () => {
  it('returns 204 when no active stream exists', async () => {
    const res = await authRequest('/api/chat/nonexistent-thread/stream', {
      method: 'GET',
    })
    expect(res.status).toBe(204)
  })
})
