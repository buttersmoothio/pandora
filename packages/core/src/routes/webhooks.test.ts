import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { encodeNsKey } from '../runtime/namespace'
import type { Env } from './helpers'
import { webhookRoutes } from './webhooks'

vi.mock('../runtime/gateways', () => ({
  createGateways: () => ({
    channel: () => ({}),
    web: () => ({}),
  }),
}))

function createMockApp(channels: Map<string, unknown>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('runtime', {
      channels,
      mastra: {},
      interactiveTools: {},
    } as never)
    c.set('envVars', {} as never)
    await next()
  })
  app.route('/wh', webhookRoutes)
  return app
}

describe('Webhook routes', () => {
  describe('ALL /wh/:encodedKey', () => {
    it('returns 404 for unknown channel', async () => {
      const app = createMockApp(new Map())
      const encoded = encodeNsKey('unknown:channel')
      const res = await app.request(`/wh/${encoded}`, { method: 'POST' })
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('not found')
    })

    it('returns 404 for channel without webhook support', async () => {
      const app = createMockApp(new Map([['test:channel', { id: 'test' }]]))
      const encoded = encodeNsKey('test:channel')
      const res = await app.request(`/wh/${encoded}`, { method: 'POST' })
      expect(res.status).toBe(404)
    })

    it('returns 401 when verification fails', async () => {
      const channel = {
        id: 'test',
        webhook: {
          verify: vi.fn(async () => false),
          handle: vi.fn(),
        },
      }
      const app = createMockApp(new Map([['test:channel', channel]]))
      const encoded = encodeNsKey('test:channel')
      const res = await app.request(`/wh/${encoded}`, { method: 'POST' })
      expect(res.status).toBe(401)
      expect(channel.webhook.verify).toHaveBeenCalled()
      expect(channel.webhook.handle).not.toHaveBeenCalled()
    })

    it('calls handle when verification passes', async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 })
      const channel = {
        id: 'test',
        webhook: {
          verify: vi.fn(async () => true),
          handle: vi.fn(() => mockResponse),
        },
      }
      const app = createMockApp(new Map([['test:channel', channel]]))
      const encoded = encodeNsKey('test:channel')
      const res = await app.request(`/wh/${encoded}`, { method: 'POST' })
      expect(res.status).toBe(200)
      expect(channel.webhook.handle).toHaveBeenCalled()
    })

    it('supports multiple HTTP methods', async () => {
      const channel = {
        id: 'test',
        webhook: {
          verify: vi.fn(async () => false),
          handle: vi.fn(),
        },
      }
      const app = createMockApp(new Map([['test:channel', channel]]))
      const encoded = encodeNsKey('test:channel')

      const getRes = await app.request(`/wh/${encoded}`, { method: 'GET' })
      expect(getRes.status).toBe(401)

      const postRes = await app.request(`/wh/${encoded}`, { method: 'POST' })
      expect(postRes.status).toBe(401)
    })

    it('verifies before handling (security order)', async () => {
      const callOrder: string[] = []
      const channel = {
        id: 'test',
        webhook: {
          verify: vi.fn(async () => {
            callOrder.push('verify')
            return true
          }),
          handle: vi.fn(() => {
            callOrder.push('handle')
            return new Response('ok')
          }),
        },
      }
      const app = createMockApp(new Map([['test:channel', channel]]))
      const encoded = encodeNsKey('test:channel')
      await app.request(`/wh/${encoded}`, { method: 'POST' })
      expect(callOrder).toEqual(['verify', 'handle'])
    })
  })
})
