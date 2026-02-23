import { handleChatStream, toAISdkStream } from '@mastra/ai-sdk'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { Hono } from 'hono'
import { isServerless } from '../env'
import { getLogger } from '../logger'
import { getMastra } from '../mastra'
import { getResumeStream, storeStream } from '../stream-store'
import type { Env } from './helpers'

/** Convert Mastra approval chunks to AI SDK tool-approval-request format. */
function createApprovalTransform(): TransformStream {
  const log = getLogger()
  return new TransformStream({
    transform(chunk: any, controller) {
      if (chunk.type === 'data-tool-call-approval') {
        log.info('[ApprovalTransform] data-tool-call-approval → tool-approval-request', {
          runId: chunk.data.runId,
          toolCallId: chunk.data.toolCallId,
        })
        controller.enqueue({
          type: 'tool-approval-request',
          approvalId: chunk.data.runId,
          toolCallId: chunk.data.toolCallId,
        })
        return
      }
      if (chunk.type === 'data-tool-call-suspended') {
        log.info('[ApprovalTransform] suppressing data-tool-call-suspended')
        return
      }
      controller.enqueue(chunk)
    },
  })
}

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

    const params = {
      messages: [{ id: crypto.randomUUID(), role: 'user' as const, parts }],
      memory: {
        // For new threads, pass metadata so Mastra creates the thread with root: true
        // and generates a title. For existing threads, just pass the ID.
        thread: clientThreadId ?? { id: threadId, metadata: { root: true } },
        resource: 'default',
      },
    }

    const rawStream = await handleChatStream({
      mastra,
      agentId: 'operator',
      params,
      sendReasoning: true,
      sendSources: true,
    })

    const stream = rawStream.pipeThrough(createApprovalTransform())

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
    const mastra = await getMastra(c.var.envVars, c.env)
    const agent = mastra.getAgent('operator')

    const options = {
      runId,
      ...(toolCallId && { toolCallId }),
      memory: { thread: threadId, resource: 'default' },
    }

    const result = approved
      ? await agent.approveToolCall(options)
      : await agent.declineToolCall(options)

    const stream = toAISdkStream(result, {
      from: 'agent',
      lastMessageId: messageId,
      sendReasoning: true,
      sendSources: true,
    }).pipeThrough(createApprovalTransform())

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
