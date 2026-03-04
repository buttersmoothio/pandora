import { describe, expect, it } from 'vitest'
import { authRequest } from '../test-helpers'

describe('Discovery routes', () => {
  describe('GET /api/plugins', () => {
    it('returns plugin list with expected structure', async () => {
      const res = await authRequest('/api/plugins')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { plugins: Record<string, unknown>[] }
      expect(Array.isArray(body.plugins)).toBe(true)
    })

    it('each plugin has required fields', async () => {
      const res = await authRequest('/api/plugins')
      const body = (await res.json()) as { plugins: Record<string, unknown>[] }

      for (const plugin of body.plugins) {
        expect(plugin.id).toBeDefined()
        expect(plugin.name).toBeDefined()
        expect(typeof plugin.enabled).toBe('boolean')
        expect(plugin.envVars).toBeDefined()
        expect(typeof plugin.envConfigured).toBe('boolean')
        expect(plugin.provides).toBeDefined()
      }
    })
  })

  describe('GET /api/models', () => {
    it('returns providers list', async () => {
      const res = await authRequest('/api/models')
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        providers: { id: string; name: string; models: unknown[]; configured: boolean }[]
      }
      expect(Array.isArray(body.providers)).toBe(true)
      expect(body.providers.length).toBeGreaterThan(0)
    })

    it('each provider has required fields', async () => {
      const res = await authRequest('/api/models')
      const body = (await res.json()) as {
        providers: Record<string, unknown>[]
      }

      for (const provider of body.providers) {
        expect(provider.id).toBeDefined()
        expect(provider.name).toBeDefined()
        expect(Array.isArray(provider.models)).toBe(true)
        expect(typeof provider.configured).toBe('boolean')
      }
    })
  })
})
