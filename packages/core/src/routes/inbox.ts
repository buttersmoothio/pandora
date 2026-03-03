import { Hono } from 'hono'
import type { Env } from './helpers'

const inboxRoutes = new Hono<Env>()

// List all messages (newest first)
inboxRoutes.get('/', async (c) => {
  const messages = await c.var.runtime.storage.inbox.list()
  return c.json({ messages })
})

// Get single message
inboxRoutes.get('/:id', async (c) => {
  const msg = await c.var.runtime.storage.inbox.get(c.req.param('id'))
  if (!msg) return c.json({ error: 'Message not found' }, 404)
  return c.json(msg)
})

// Mark as read
inboxRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const msg = await c.var.runtime.storage.inbox.get(id)
  if (!msg) return c.json({ error: 'Message not found' }, 404)

  const body = await c.req.json<{ read?: boolean }>()
  if (body.read) {
    await c.var.runtime.storage.inbox.markRead(id)
  }
  return c.json({ ...msg, read: body.read ?? msg.read })
})

// Delete message
inboxRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const msg = await c.var.runtime.storage.inbox.get(id)
  if (!msg) return c.json({ error: 'Message not found' }, 404)

  await c.var.runtime.storage.inbox.delete(id)
  return c.json({ deleted: id })
})

export { inboxRoutes }
