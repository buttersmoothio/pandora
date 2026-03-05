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
  if (!om) return c.json({ record: null })
  const record = await om.getRecord('', RESOURCE_ID)
  return c.json({ record })
})
