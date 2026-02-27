import { describe, expect, it } from 'vitest'
import { authRequest, request } from './test-helpers'

describe('Health check', () => {
  it('GET / returns app info with auth state', async () => {
    const res = await request('/')
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.name).toBe('Pandora')
    expect(typeof body.version).toBe('string')
    expect(typeof body.runtime).toBe('string')
    expect(body.serverless).toBe(false)
    expect(body.auth).toHaveProperty('setup')
    expect(body.auth).toHaveProperty('authenticated')
  })
})

describe('Config routes', () => {
  it('GET /api/config returns default config', async () => {
    const res = await authRequest('/api/config')
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, Record<string, unknown>>
    expect(body.identity.name).toBe('Pandora')
    expect(body.models.operator).toHaveProperty('provider')
    expect(body.toolPlugins).toBeDefined()
  })
})

describe('Tools routes', () => {
  it('GET /api/tools returns tool manifests with config state', async () => {
    const res = await authRequest('/api/tools')
    expect(res.status).toBe(200)

    const body = (await res.json()) as { tools: Record<string, unknown>[] }
    expect(Array.isArray(body.tools)).toBe(true)

    const currentTime = body.tools.find((t) => t.id === 'current-time')
    expect(currentTime).toBeDefined()
    expect(currentTime?.description).toBe('Get the current date and time in ISO 8601 format')
    expect(currentTime?.sandbox).toBe('compartment')
  })
})

describe('Error handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request('/unknown/path')
    expect(res.status).toBe(404)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('Not Found')
  })
})

describe('Auth flow', () => {
  it('blocks protected routes without auth', async () => {
    const res = await request('/api/models')
    // Either 403 (setup_required) or 401 (unauthorized) depending on setup state
    expect([401, 403]).toContain(res.status)
  })

  it('allows protected routes with valid token', async () => {
    const res = await authRequest('/api/models')
    expect(res.status).toBe(200)
  })
})
