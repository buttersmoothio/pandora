import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxMessage, InboxStore } from '../storage/inbox-store'
import type { Env } from './helpers'
import { inboxRoutes } from './inbox'

const SAMPLE_MESSAGE: InboxMessage = {
  id: 'msg-1',
  subject: 'Test Subject',
  body: 'Test body',
  threadId: 'thread-1',
  destination: 'web',
  status: 'sent',
  read: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  archivedAt: null,
}

function createMockInbox(overrides: Partial<InboxStore> = {}): InboxStore {
  return {
    add: vi.fn(async (msg) => ({ ...SAMPLE_MESSAGE, ...msg })),
    list: vi.fn(async () => [SAMPLE_MESSAGE]),
    get: vi.fn(async (id) => (id === 'msg-1' ? SAMPLE_MESSAGE : null)),
    markRead: vi.fn(async () => {}),
    updateStatus: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    unarchive: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    ...overrides,
  }
}

function createApp(inbox: InboxStore): Hono<Env> {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('runtime', { storage: { inbox } } as never)
    await next()
  })
  app.route('/api/inbox', inboxRoutes)
  return app
}

describe('inbox routes', () => {
  let inbox: InboxStore
  let app: Hono<Env>

  beforeEach(() => {
    inbox = createMockInbox()
    app = createApp(inbox)
  })

  describe('GET /api/inbox', () => {
    it('returns messages list', async () => {
      const res = await app.request('/api/inbox')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { messages: InboxMessage[] }
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].id).toBe('msg-1')
      expect(inbox.list).toHaveBeenCalledWith({ archived: false })
    })

    it('passes archived filter when archived=true', async () => {
      const res = await app.request('/api/inbox?archived=true')
      expect(res.status).toBe(200)
      expect(inbox.list).toHaveBeenCalledWith({ archived: true })
    })
  })

  describe('GET /api/inbox/:id', () => {
    it('returns message by id', async () => {
      const res = await app.request('/api/inbox/msg-1')
      expect(res.status).toBe(200)

      const body = (await res.json()) as InboxMessage
      expect(body.id).toBe('msg-1')
      expect(body.subject).toBe('Test Subject')
      expect(inbox.get).toHaveBeenCalledWith('msg-1')
    })

    it('returns 404 for missing message', async () => {
      const res = await app.request('/api/inbox/nonexistent')
      expect(res.status).toBe(404)

      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Message not found')
    })
  })

  describe('PATCH /api/inbox/:id', () => {
    it('marks message as read', async () => {
      const updatedMessage = { ...SAMPLE_MESSAGE, read: true }
      inbox = createMockInbox({
        get: vi.fn().mockResolvedValueOnce(SAMPLE_MESSAGE).mockResolvedValueOnce(updatedMessage),
      })
      app = createApp(inbox)

      const res = await app.request(
        new Request('http://localhost/api/inbox/msg-1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        }),
      )
      expect(res.status).toBe(200)
      expect(inbox.markRead).toHaveBeenCalledWith('msg-1')

      const body = (await res.json()) as InboxMessage
      expect(body.read).toBe(true)
    })

    it('archives message', async () => {
      const archivedMessage = { ...SAMPLE_MESSAGE, archivedAt: '2024-01-02T00:00:00.000Z' }
      inbox = createMockInbox({
        get: vi.fn().mockResolvedValueOnce(SAMPLE_MESSAGE).mockResolvedValueOnce(archivedMessage),
      })
      app = createApp(inbox)

      const res = await app.request(
        new Request('http://localhost/api/inbox/msg-1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: true }),
        }),
      )
      expect(res.status).toBe(200)
      expect(inbox.archive).toHaveBeenCalledWith('msg-1')
      expect(inbox.unarchive).not.toHaveBeenCalled()
    })

    it('unarchives message', async () => {
      const archivedMessage = { ...SAMPLE_MESSAGE, archivedAt: '2024-01-02T00:00:00.000Z' }
      inbox = createMockInbox({
        get: vi.fn().mockResolvedValueOnce(archivedMessage).mockResolvedValueOnce(SAMPLE_MESSAGE),
      })
      app = createApp(inbox)

      const res = await app.request(
        new Request('http://localhost/api/inbox/msg-1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: false }),
        }),
      )
      expect(res.status).toBe(200)
      expect(inbox.unarchive).toHaveBeenCalledWith('msg-1')
      expect(inbox.archive).not.toHaveBeenCalled()
    })

    it('returns 404 for missing message', async () => {
      const res = await app.request(
        new Request('http://localhost/api/inbox/nonexistent', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        }),
      )
      expect(res.status).toBe(404)

      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Message not found')
    })
  })

  describe('DELETE /api/inbox/:id', () => {
    it('deletes message and returns id', async () => {
      const res = await app.request(
        new Request('http://localhost/api/inbox/msg-1', { method: 'DELETE' }),
      )
      expect(res.status).toBe(200)

      const body = (await res.json()) as { deleted: string }
      expect(body.deleted).toBe('msg-1')
      expect(inbox.delete).toHaveBeenCalledWith('msg-1')
    })

    it('returns 404 for missing message', async () => {
      const res = await app.request(
        new Request('http://localhost/api/inbox/nonexistent', { method: 'DELETE' }),
      )
      expect(res.status).toBe(404)

      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Message not found')
    })
  })
})
