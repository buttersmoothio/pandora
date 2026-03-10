import { describe, expect, it } from 'vitest'
import { authRequest } from '../test-helpers'

describe('Thread routes', () => {
  describe('GET /api/threads', () => {
    it('returns thread list', async () => {
      const res = await authRequest('/api/threads')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { threads: unknown[]; activeStreamIds: unknown[] }
      expect(Array.isArray(body.threads)).toBe(true)
      expect(Array.isArray(body.activeStreamIds)).toBe(true)
    })
  })

  describe('GET /api/threads/:id', () => {
    it('returns 404 for nonexistent thread', async () => {
      const res = await authRequest('/api/threads/nonexistent-id')
      expect(res.status).toBe(404)

      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('not found')
    })
  })

  describe('POST /api/threads/:id/fork', () => {
    it('returns 400 when messageId is missing', async () => {
      const res = await authRequest('/api/threads/some-thread/fork', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('messageId')
    })

    it('returns 400 when messageId is not a string', async () => {
      const res = await authRequest('/api/threads/some-thread/fork', {
        method: 'POST',
        body: JSON.stringify({ messageId: 123 }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/threads/:id', () => {
    it('returns 404 for nonexistent thread', async () => {
      const res = await authRequest('/api/threads/nonexistent-id', {
        method: 'DELETE',
      })
      expect(res.status).toBe(404)

      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('not found')
    })
  })
})
