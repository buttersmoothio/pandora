import { describe, expect, it } from 'vitest'
import { authRequest } from '../../test-helpers'

interface McpServer {
  id: string
  name: string
  type: string
  enabled: boolean
  requireApproval: boolean
  tools: unknown[]
}

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

  describe('GET /api/mcp-servers', () => {
    it('returns servers array', async () => {
      const res = await authRequest('/api/mcp-servers')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { servers: McpServer[] }
      expect(Array.isArray(body.servers)).toBe(true)
    })
  })

  describe('POST /api/mcp-servers', () => {
    it('returns 400 when neither command nor url provided', async () => {
      const res = await authRequest('/api/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Invalid' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid url', async () => {
      const res = await authRequest('/api/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({ url: 'not-a-url' }),
      })
      expect(res.status).toBe(400)
    })

    // reload() tries to connect MCP servers which times out in test
    it('creates server, persists it, and returns correct defaults', async () => {
      const createRes = await authRequest('/api/mcp-servers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Server',
          command: 'node',
          args: ['server.js'],
        }),
      })
      expect(createRes.status).toBe(201)

      const created = (await createRes.json()) as {
        id: string
        name: string
        command: string
      }
      expect(typeof created.id).toBe('string')
      expect(created.name).toBe('Test Server')
      expect(created.command).toBe('node')

      // Verify it appears in GET with correct defaults
      const listRes = await authRequest('/api/mcp-servers')
      const body = (await listRes.json()) as { servers: McpServer[] }
      const found = body.servers.find((s) => s.id === created.id)
      expect(found).toBeDefined()
      expect(found?.name).toBe('Test Server')
      expect(found?.type).toBe('stdio')
      expect(found?.enabled).toBe(true)
      expect(found?.requireApproval).toBe(true)
    }, 15_000)
  })
})
