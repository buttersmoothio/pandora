import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from './helpers'
import { mcpOAuthRoutes } from './mcp-oauth'

function createMockApp(mocks: {
  handleOAuthCallback?: ReturnType<typeof vi.fn>
  reload?: ReturnType<typeof vi.fn>
  envVars?: Record<string, string | undefined>
}) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('runtime', {
      mcpManager: {
        handleOAuthCallback: mocks.handleOAuthCallback ?? vi.fn().mockResolvedValue('server-1'),
      },
      reload: mocks.reload ?? vi.fn(),
    } as never)
    c.set('envVars', mocks.envVars ?? {})
    await next()
  })
  app.route('/oauth', mcpOAuthRoutes)
  return app
}

describe('GET /oauth/mcp/callback', () => {
  it('returns 400 when code is missing', async () => {
    const app = createMockApp({})
    const res = await app.request('/oauth/mcp/callback?state=abc')

    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toContain('Missing code or state')
  })

  it('returns 400 when state is missing', async () => {
    const app = createMockApp({})
    const res = await app.request('/oauth/mcp/callback?code=abc')

    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toContain('Missing code or state')
  })

  it('returns 400 when both are missing', async () => {
    const app = createMockApp({})
    const res = await app.request('/oauth/mcp/callback')

    expect(res.status).toBe(400)
  })

  it('returns success HTML on successful callback', async () => {
    const handleFn = vi.fn().mockResolvedValue('server-1')
    const reloadFn = vi.fn()
    const app = createMockApp({
      handleOAuthCallback: handleFn,
      reload: reloadFn,
    })

    const res = await app.request('/oauth/mcp/callback?code=auth-code&state=my-state')

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Authorization Successful')
    expect(handleFn).toHaveBeenCalledWith('auth-code', 'my-state')
    expect(reloadFn).toHaveBeenCalled()
  })

  it('redirects to FRONTEND_URL on success when set', async () => {
    const app = createMockApp({
      handleOAuthCallback: vi.fn().mockResolvedValue('server-1'),
      reload: vi.fn(),
      envVars: { FRONTEND_URL: 'https://ui.pandora.test' },
    })

    const res = await app.request('/oauth/mcp/callback?code=auth-code&state=my-state')

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('https://ui.pandora.test/plugins')
    expect(location).toContain('oauth=success')
    expect(location).toContain('server=server-1')
  })

  it('returns 500 HTML on callback error', async () => {
    const app = createMockApp({
      handleOAuthCallback: vi.fn().mockRejectedValue(new Error('Invalid state')),
    })

    const res = await app.request('/oauth/mcp/callback?code=auth-code&state=bad-state')

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('Authorization Failed')
    expect(text).toContain('Invalid state')
  })

  it('redirects to FRONTEND_URL on error when set', async () => {
    const app = createMockApp({
      handleOAuthCallback: vi.fn().mockRejectedValue(new Error('fail')),
      envVars: { FRONTEND_URL: 'https://ui.pandora.test' },
    })

    const res = await app.request('/oauth/mcp/callback?code=auth-code&state=bad')

    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('oauth=error')
  })

  it('escapes HTML in error messages', async () => {
    const app = createMockApp({
      handleOAuthCallback: vi.fn().mockRejectedValue(new Error('<script>alert("xss")</script>')),
    })

    const res = await app.request('/oauth/mcp/callback?code=c&state=s')

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('<script>')
    expect(text).toContain('&lt;script&gt;')
  })

  it('triggers runtime reload after successful OAuth', async () => {
    const reloadFn = vi.fn()
    const app = createMockApp({
      handleOAuthCallback: vi.fn().mockResolvedValue('srv'),
      reload: reloadFn,
    })

    await app.request('/oauth/mcp/callback?code=c&state=s')

    expect(reloadFn).toHaveBeenCalledOnce()
  })
})
