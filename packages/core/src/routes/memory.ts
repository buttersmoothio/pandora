import type { Memory } from '@mastra/memory'
import type { ObservationalMemory } from '@mastra/memory/processors'
import { Hono } from 'hono'
import type { Env } from './helpers'
import { getMemoryOrFail } from './helpers'

const RESOURCE_ID = 'default'

/** Get the OM processor from memory's input processors. */
async function getOM(memory: Memory) {
  const processors = await memory.getInputProcessors()
  return processors.find((p): p is ObservationalMemory => p.id === 'observational-memory')
}

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

/** GET /api/memory/observations — read current observations */
memoryRoutes.get('/observations', async (c) => {
  const { memory } = await getMemoryOrFail(c)
  const om = await getOM(memory)
  if (!om) return c.json({ observations: null })
  const observations = await om.getObservations('', RESOURCE_ID)
  return c.json({ observations: observations ?? null })
})

/** GET /api/memory/record — read full OM record */
memoryRoutes.get('/record', async (c) => {
  const { memory } = await getMemoryOrFail(c)
  const om = await getOM(memory)
  if (!om) return c.json({ record: null, thresholds: null })
  const record = await om.getRecord('', RESOURCE_ID)
  const { scope, observation, reflection } = om.config

  // pendingMessageTokens on the record is set by OM during processInputStep.
  // It's a per-thread snapshot that can oscillate between threads, but it
  // accurately reflects what OM's internal counting sees (including part-level
  // observation markers). A live recount from our side would overcount because
  // we can't replicate OM's part-level filtering.

  return c.json({
    record,
    thresholds: {
      scope,
      messageTokens:
        typeof observation.messageTokens === 'number'
          ? observation.messageTokens
          : observation.messageTokens.max,
      observationTokens:
        typeof reflection.observationTokens === 'number'
          ? reflection.observationTokens
          : reflection.observationTokens.max,
    },
  })
})
