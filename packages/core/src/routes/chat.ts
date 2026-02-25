import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { Hono } from 'hono'
import { isServerless } from '../env'
import { getLogger } from '../logger'
import { getResumeStream, storeStream } from '../stream-store'
import type { Env } from './helpers'
import { getChannelRuntime } from './helpers'

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
    const isNewThread = !clientThreadId

    log.info('Chat request received', { threadId, partsCount: parts.length })

    const runtime = await getChannelRuntime(c)
    const stream = await runtime.streamAISdk({
      threadId,
      parts,
      isNewThread,
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

// Tool approval endpoint — approve or deny a pending tool call
chatRoutes.post('/approve', async (c) => {
  const log = getLogger()
  try {
    const { runId, toolCallId, approved, threadId, messageId } = await c.req.json()
    if (!(runId && threadId)) {
      return c.json({ error: 'runId and threadId are required' }, 400)
    }

    log.info('Tool approval', { threadId, runId, toolCallId, approved })

    const runtime = await getChannelRuntime(c)
    const stream = approved
      ? await runtime.approveToolCallAISdk({ runId, toolCallId, threadId, messageId })
      : await runtime.declineToolCallAISdk({ runId, toolCallId, threadId, messageId })

    const res = createUIMessageStreamResponse({
      stream,
      ...(!isServerless() && {
        consumeSseStream: ({ stream: sseStream }) => {
          storeStream(threadId, sseStream)
        },
      }),
    })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Tool approval failed', { error: message })
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
