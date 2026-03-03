import type { MessagePart } from '@pandorakit/sdk/channels'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { Hono } from 'hono'
import { getLogger } from '../logger'
import type { Env } from './helpers'
import { isServerless } from './helpers'

const chatRoutes = new Hono<Env>()

// Chat endpoint - thread-based streaming
chatRoutes.post('/', async (c) => {
  const log = getLogger()
  try {
    const { parts, threadId: clientThreadId } = await c.req.json<{
      parts?: MessagePart[]
      threadId?: string
    }>()
    if (!Array.isArray(parts) || parts.length === 0) {
      return c.json({ error: 'parts must be a non-empty array' }, 400)
    }

    const threadId = clientThreadId ?? crypto.randomUUID()
    const isNewThread = !clientThreadId

    log.info('Chat request received', { threadId, partsCount: parts.length })

    const runtime = c.var.runtime
    const stream = await runtime.web.stream({
      threadId,
      parts,
      isNewThread,
    })

    log.debug('Chat stream created', { threadId })
    const res = createUIMessageStreamResponse({
      stream,
      ...(!isServerless() && {
        consumeSseStream: ({ stream: sseStream }) => {
          runtime.streams.store(threadId, sseStream)
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
    const { runId, toolCallId, approved, threadId, messageId } = await c.req.json<{
      runId?: string
      toolCallId?: string
      approved?: boolean
      threadId?: string
      messageId?: string
    }>()
    if (!(runId && threadId)) {
      return c.json({ error: 'runId and threadId are required' }, 400)
    }

    log.info('Tool approval', { threadId, runId, toolCallId, approved })

    const runtime = c.var.runtime
    const stream = approved
      ? await runtime.web.approveToolCall({ runId, toolCallId, threadId, messageId })
      : await runtime.web.declineToolCall({ runId, toolCallId, threadId, messageId })

    const res = createUIMessageStreamResponse({
      stream,
      ...(!isServerless() && {
        consumeSseStream: ({ stream: sseStream }) => {
          runtime.streams.store(threadId, sseStream)
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
  const stream = c.var.runtime.streams.getResume(c.req.param('threadId'))
  if (!stream) return c.body(null, 204)
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    status: 200,
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
})

export { chatRoutes }
