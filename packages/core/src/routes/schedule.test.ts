import { describe, expect, it } from 'vitest'
import { authRequest } from '../test-helpers'

describe('Schedule routes', () => {
  describe('GET /api/schedule', () => {
    it('returns empty task list by default', async () => {
      const res = await authRequest('/api/schedule')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { enabled: boolean; tasks: unknown[] }
      expect(body.enabled).toBe(false)
      expect(body.tasks).toEqual([])
    })
  })

  describe('POST /api/schedule', () => {
    it('creates a task and returns 201', async () => {
      const res = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Morning check',
          cron: '0 8 * * *',
          prompt: 'Check my emails',
        }),
      })
      expect(res.status).toBe(201)

      const task = (await res.json()) as { id: string; name: string; cron: string }
      expect(task.id).toBeDefined()
      expect(task.name).toBe('Morning check')
      expect(task.cron).toBe('0 8 * * *')
    })

    it('validates required fields', async () => {
      const res = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({ name: 'Missing fields' }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/schedule/:id', () => {
    it('updates task fields', async () => {
      // Create first
      const createRes = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Update me',
          cron: '0 9 * * *',
          prompt: 'Original prompt',
        }),
      })
      const created = (await createRes.json()) as { id: string }

      // Update
      const updateRes = await authRequest(`/api/schedule/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated name', prompt: 'New prompt' }),
      })
      expect(updateRes.status).toBe(200)

      const updated = (await updateRes.json()) as { name: string; prompt: string }
      expect(updated.name).toBe('Updated name')
      expect(updated.prompt).toBe('New prompt')
    })

    it('returns 404 for missing task', async () => {
      const res = await authRequest('/api/schedule/00000000-0000-0000-0000-000000000000', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'nope' }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/schedule/:id', () => {
    it('deletes an existing task', async () => {
      // Create first
      const createRes = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Delete me',
          cron: '0 10 * * *',
          prompt: 'To be deleted',
        }),
      })
      const created = (await createRes.json()) as { id: string }

      const deleteRes = await authRequest(`/api/schedule/${created.id}`, {
        method: 'DELETE',
      })
      expect(deleteRes.status).toBe(200)

      const body = (await deleteRes.json()) as { deleted: string }
      expect(body.deleted).toBe(created.id)
    })

    it('returns 404 for missing task', async () => {
      const res = await authRequest('/api/schedule/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
      })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/schedule/:id', () => {
    it('returns a single task with status', async () => {
      // Create first
      const createRes = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Get me',
          cron: '0 11 * * *',
          prompt: 'Single task',
        }),
      })
      const created = (await createRes.json()) as { id: string }

      const getRes = await authRequest(`/api/schedule/${created.id}`)
      expect(getRes.status).toBe(200)

      const task = (await getRes.json()) as {
        id: string
        name: string
        nextRun: string | null
        isRunning: boolean
      }
      expect(task.id).toBe(created.id)
      expect(task.name).toBe('Get me')
      expect(task.isRunning).toBe(false)
    })

    it('returns 404 for missing task', async () => {
      const res = await authRequest('/api/schedule/00000000-0000-0000-0000-000000000000')
      expect(res.status).toBe(404)
    })
  })
})
