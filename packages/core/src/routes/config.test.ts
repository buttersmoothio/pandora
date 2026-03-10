import { describe, expect, it } from 'vitest'
import { authRequest } from '../test-helpers'

describe('Config routes', () => {
  describe('GET /api/config', () => {
    it('returns current config', async () => {
      const res = await authRequest('/api/config')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.identity).toBeDefined()
      expect(body.timezone).toBeDefined()
      expect(body.models).toBeDefined()
      expect(body.schedule).toBeDefined()
    })

    it('has default identity name', async () => {
      const res = await authRequest('/api/config')
      const body = (await res.json()) as { identity: { name: string } }
      expect(body.identity.name).toBe('Pandora')
    })
  })

  describe('PATCH /api/config', () => {
    it('updates identity name', async () => {
      const res = await authRequest('/api/config', {
        method: 'PATCH',
        body: JSON.stringify({ identity: { name: 'TestBot' } }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { identity: { name: string } }
      expect(body.identity.name).toBe('TestBot')
    })

    it('updates timezone', async () => {
      const res = await authRequest('/api/config', {
        method: 'PATCH',
        body: JSON.stringify({ timezone: 'America/New_York' }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { timezone: string }
      expect(body.timezone).toBe('America/New_York')
    })

    it('returns 400 for invalid timezone', async () => {
      const res = await authRequest('/api/config', {
        method: 'PATCH',
        body: JSON.stringify({ timezone: 'Invalid/Timezone' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid model config', async () => {
      const res = await authRequest('/api/config', {
        method: 'PATCH',
        body: JSON.stringify({ models: { operator: { provider: '', model: '' } } }),
      })
      expect(res.status).toBe(400)
    })

    it('persists changes across requests', async () => {
      await authRequest('/api/config', {
        method: 'PATCH',
        body: JSON.stringify({ identity: { name: 'Persisted' } }),
      })
      const res = await authRequest('/api/config')
      const body = (await res.json()) as { identity: { name: string } }
      expect(body.identity.name).toBe('Persisted')
    })
  })
})
