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
