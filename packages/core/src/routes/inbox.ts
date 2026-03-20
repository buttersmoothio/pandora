import { Hono } from 'hono'
import type { Env } from './helpers'
import { paginate, parsePagination } from './helpers'

const inboxRoutes: Hono<Env> = new Hono<Env>()

// List messages (newest first, paginated)
inboxRoutes.get('/', async (c) => {
  const archived = c.req.query('archived') === 'true'
  const { page, perPage } = parsePagination(c)
  const messages = await c.var.runtime.storage.inbox.list({ archived })
  return c.json(paginate(messages, page, perPage))
})

// Get single message
inboxRoutes.get('/:id', async (c) => {
  const msg = await c.var.runtime.storage.inbox.get(c.req.param('id'))
  if (!msg) {
    return c.json({ error: 'Message not found' }, 404)
  }
  return c.json(msg)
})

// Update message (mark read, archive/unarchive)
inboxRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const msg = await c.var.runtime.storage.inbox.get(id)
  if (!msg) {
    return c.json({ error: 'Message not found' }, 404)
  }

  const body = await c.req.json<{ read?: boolean; archived?: boolean }>()
  if (body.read) {
    await c.var.runtime.storage.inbox.markRead(id)
  }
  if (body.archived === true) {
    await c.var.runtime.storage.inbox.archive(id)
  } else if (body.archived === false) {
    await c.var.runtime.storage.inbox.unarchive(id)
  }

  const updated = await c.var.runtime.storage.inbox.get(id)
  return c.json(updated)
})

// Delete message
inboxRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const msg = await c.var.runtime.storage.inbox.get(id)
  if (!msg) {
    return c.json({ error: 'Message not found' }, 404)
  }

  await c.var.runtime.storage.inbox.delete(id)
  return c.json({ id })
})

export { inboxRoutes }
