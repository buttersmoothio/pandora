import { handleChatStream } from '@mastra/ai-sdk'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { Hono } from 'hono'
import { isServerless } from '../env'
import { getLogger } from '../logger'
import { getMastra } from '../mastra'
import { getResumeStream, storeStream } from '../stream-store'
import type { Env } from './helpers'

const chatRoutes = new Hono<Env>()

// Chat endpoint - thread-based streaming
chatRoutes.post('/', async (c) => {
  const log = getLogger()
  try {
    const body = await c.req.json()

    // Accept { parts, threadId? } — server wraps into messages + memory config
    const { parts, threadId: clientThreadId } = body
    if (!Array.isArray(parts) || parts.length === 0) {
      return c.json({ error: 'parts must be a non-empty array' }, 400)
    }

    const threadId = clientThreadId ?? crypto.randomUUID()

    log.info('Chat request received', { threadId, partsCount: parts.length })
    const mastra = await getMastra(c.var.envVars, c.env)

    // Mark new conversations as root threads for fork filtering
    if (!clientThreadId) {
      const memory = await mastra.getAgent('operator').getMemory()
      if (memory) {
        await memory.createThread({ resourceId: 'default', threadId, metadata: { root: true } })
      }
    }

    const params = {
      messages: [{ id: crypto.randomUUID(), role: 'user' as const, parts }],
      memory: {
        thread: threadId,
        resource: 'default',
      },
    }

    const stream = await handleChatStream({
      mastra,
      agentId: 'operator',
      params,
      sendReasoning: true,
      sendSources: true,
    })

    log.debug('Chat stream created', { threadId })
    const res = createUIMessageStreamResponse({
      stream,
      ...(!isServerless() && {
        consumeSseStream: ({ stream: sseStream }) => {
          storeStream(threadId, sseStream)
        },
      }),
    })
    res.headers.set('X-Thread-Id', threadId)
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Chat request failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Resume stream endpoint — AI SDK sends GET /api/chat/{threadId}/stream when resume: true
chatRoutes.get('/:threadId/stream', (c) => {
  if (isServerless()) return c.body(null, 204)
  const stream = getResumeStream(c.req.param('threadId'))
  if (!stream) return c.body(null, 204)
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    status: 200,
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
})

export { chatRoutes }
