import { describe, expect, it } from 'vitest'
import { authRequest } from '../../test-helpers'

describe('Schedule routes', () => {
  describe('GET /api/schedule', () => {
    it('returns empty task list by default', async () => {
      const res = await authRequest('/api/schedule')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { enabled: boolean; tasks: unknown[] }
      expect(body.enabled).toBe(true)
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

  describe('runAt tasks', () => {
    it('POST with runAt creates one-time task', async () => {
      const future = new Date(Date.now() + 3_600_000).toISOString()
      const res = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'One-time task',
          runAt: future,
          prompt: 'Do this once',
        }),
      })
      expect(res.status).toBe(201)

      const task = (await res.json()) as { id: string; runAt: string; cron?: string }
      expect(task.runAt).toBe(future)
      expect(task.cron).toBeUndefined()
    })

    it('POST with both cron and runAt returns 400', async () => {
      const res = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Invalid',
          cron: '0 8 * * *',
          runAt: new Date().toISOString(),
          prompt: 'Cannot have both',
        }),
      })
      expect(res.status).toBe(400)
    })

    it('POST with neither cron nor runAt returns 400', async () => {
      const res = await authRequest('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Invalid',
          prompt: 'Need one of cron or runAt',
        }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('Heartbeat routes', () => {
    describe('GET /api/schedule/heartbeat', () => {
      it('returns default heartbeat config', async () => {
        const res = await authRequest('/api/schedule/heartbeat')
        expect(res.status).toBe(200)

        const body = (await res.json()) as {
          enabled: boolean
          cron: string
          tasks: unknown[]
          nextRun: string | null
          isRunning: boolean
        }
        expect(body.enabled).toBe(false)
        expect(body.cron).toBe('*/30 * * * *')
        expect(body.tasks).toEqual([])
        expect(body.isRunning).toBe(false)
      })
    })

    describe('PATCH /api/schedule/heartbeat', () => {
      it('updates heartbeat config', async () => {
        const res = await authRequest('/api/schedule/heartbeat', {
          method: 'PATCH',
          body: JSON.stringify({
            enabled: true,
            cron: '*/15 * * * *',
            tasks: [{ id: crypto.randomUUID(), description: 'Check email', enabled: true }],
          }),
        })
        expect(res.status).toBe(200)

        const body = (await res.json()) as { enabled: boolean; cron: string; tasks: unknown[] }
        expect(body.enabled).toBe(true)
        expect(body.cron).toBe('*/15 * * * *')
        expect(body.tasks).toHaveLength(1)
      })

      it('sets and clears active hours', async () => {
        // Set
        const setRes = await authRequest('/api/schedule/heartbeat', {
          method: 'PATCH',
          body: JSON.stringify({
            activeHours: { start: '08:00', end: '22:00' },
          }),
        })
        expect(setRes.status).toBe(200)
        const setBody = (await setRes.json()) as { activeHours?: { start: string; end: string } }
        expect(setBody.activeHours).toEqual({ start: '08:00', end: '22:00' })

        // Clear
        const clearRes = await authRequest('/api/schedule/heartbeat', {
          method: 'PATCH',
          body: JSON.stringify({ activeHours: null }),
        })
        expect(clearRes.status).toBe(200)
        const clearBody = (await clearRes.json()) as { activeHours?: unknown }
        expect(clearBody.activeHours).toBeUndefined()
      })

      it('sets and clears destination', async () => {
        const setRes = await authRequest('/api/schedule/heartbeat', {
          method: 'PATCH',
          body: JSON.stringify({ destination: 'Web Inbox' }),
        })
        expect(setRes.status).toBe(200)
        const setBody = (await setRes.json()) as { destination?: string }
        expect(setBody.destination).toBe('Web Inbox')

        const clearRes = await authRequest('/api/schedule/heartbeat', {
          method: 'PATCH',
          body: JSON.stringify({ destination: null }),
        })
        expect(clearRes.status).toBe(200)
        const clearBody = (await clearRes.json()) as { destination?: string }
        expect(clearBody.destination).toBeUndefined()
      })
    })
  })
})
