import { Hono } from 'hono'
import type { Env } from './helpers'
import { getMemoryOrFail } from './helpers'

const RESOURCE_ID = 'default'

export const memoryRoutes = new Hono<Env>()

/** GET /api/memory/working — read current working memory content */
memoryRoutes.get('/working', async (c) => {
  const { memory } = await getMemoryOrFail(c)
  const content = await memory.getWorkingMemory({
    threadId: '',
    resourceId: RESOURCE_ID,
  })
  return c.json({ content })
})

/** PUT /api/memory/working — overwrite working memory content */
memoryRoutes.put('/working', async (c) => {
  const { memory } = await getMemoryOrFail(c)
  const body = await c.req.json<{ content: string }>()
  await memory.updateWorkingMemory({
    threadId: '',
    resourceId: RESOURCE_ID,
    workingMemory: body.content,
  })
  return c.json({ content: body.content })
})
