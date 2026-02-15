import { describe, expect, it } from 'vitest'
import { request } from './test-helpers'

describe('Health check', () => {
  it('GET / returns app info', async () => {
    const res = await request('/')
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.name).toBe('Pandora')
    expect(body.version).toBeDefined()
    expect(body.runtime).toBeDefined()
    expect(body.serverless).toBe(false)
  })
})

describe('Config routes', () => {
  it('GET /api/config returns default config', async () => {
    const res = await request('/api/config')
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, Record<string, unknown>>
    expect(body.identity).toBeDefined()
    expect(body.identity.name).toBe('Pandora')
    expect(body.models).toBeDefined()
    expect(body.channels).toBeDefined()
  })
})

describe('Placeholder routes', () => {
  it('POST /wh/telegram returns placeholder', async () => {
    const res = await request('/wh/telegram', { method: 'POST' })
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.message).toContain('not yet implemented')
  })

  it('POST /api/cron/:taskId returns placeholder', async () => {
    const res = await request('/api/cron/test-task', { method: 'POST' })
    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(body.taskId).toBe('test-task')
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
