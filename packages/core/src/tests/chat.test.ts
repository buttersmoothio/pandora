import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { chatRoutes } from '../routes/chat'
import type { Env } from '../routes/helpers'
import { authRequest } from '../test-helpers'

// ---------------------------------------------------------------------------
// Lightweight test app with mock runtime (bypasses auth)
// ---------------------------------------------------------------------------

function emptyStream(): ReadableStream {
  return new ReadableStream({
    start(c: ReadableStreamDefaultController): void {
      c.close()
    },
  })
}

function createMockApp(mocks: {
  stream?: ReturnType<typeof vi.fn>
  approveToolCall?: ReturnType<typeof vi.fn>
  declineToolCall?: ReturnType<typeof vi.fn>
  store?: ReturnType<typeof vi.fn>
  getResume?: ReturnType<typeof vi.fn>
}): Hono<Env> {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('runtime', {
      web: {
        stream: mocks.stream ?? vi.fn(),
        approveToolCall: mocks.approveToolCall ?? vi.fn(),
        declineToolCall: mocks.declineToolCall ?? vi.fn(),
      },
      streams: {
        store: mocks.store ?? vi.fn(),
        getResume: mocks.getResume ?? vi.fn().mockReturnValue(null),
        getActiveIds: vi.fn().mockReturnValue([]),
      },
    } as never)
    await next()
  })
  app.route('/api/chat', chatRoutes)
  return app
}

function post(app: Hono<Env>, path: string, body: unknown): Response | Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Validation tests (via real app + auth)
// ---------------------------------------------------------------------------

describe('POST /api/chat validation', () => {
  it('returns 400 when parts is missing', async () => {
    const res = await authRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })

  it('returns 400 when parts is empty array', async () => {
    const res = await authRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ parts: [] }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })

  it('returns 400 when parts is not an array', async () => {
    const res = await authRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ parts: 'hello' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('non-empty array')
  })
})

describe('POST /api/chat/approve validation', () => {
  it('returns 400 when runId is missing', async () => {
    const res = await authRequest('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify({ threadId: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('runId and threadId are required')
  })

  it('returns 400 when threadId is missing', async () => {
    const res = await authRequest('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify({ runId: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('runId and threadId are required')
  })

  it('returns 400 when both runId and threadId are missing', async () => {
    const res = await authRequest('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify({ approved: true }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('runId and threadId are required')
  })
})

describe('GET /api/chat/:threadId/stream', () => {
  it('returns 204 when no active stream exists', async () => {
    const res = await authRequest('/api/chat/nonexistent-thread/stream', {
      method: 'GET',
    })
    expect(res.status).toBe(204)
  })
})

// ---------------------------------------------------------------------------
// Happy-path streaming tests (mock runtime)
// ---------------------------------------------------------------------------

describe('POST /api/chat streaming', () => {
  it('returns SSE response with generated X-Thread-Id for new thread', async () => {
    const streamFn = vi.fn().mockResolvedValue(emptyStream())
    const app = createMockApp({ stream: streamFn })

    const res = await post(app, '/api/chat', {
      parts: [{ type: 'text', text: 'Hello' }],
    })

    expect(res.status).toBe(200)
    const threadId = res.headers.get('X-Thread-Id')
    expect(threadId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(streamFn).toHaveBeenCalledWith({
      threadId,
      parts: [{ type: 'text', text: 'Hello' }],
      isNewThread: true,
    })
  })

  it('uses client-provided threadId for existing thread', async () => {
    const streamFn = vi.fn().mockResolvedValue(emptyStream())
    const app = createMockApp({ stream: streamFn })

    const res = await post(app, '/api/chat', {
      parts: [{ type: 'text', text: 'Hello' }],
      threadId: 'existing-thread-id',
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Thread-Id')).toBe('existing-thread-id')
    expect(streamFn).toHaveBeenCalledWith({
      threadId: 'existing-thread-id',
      parts: [{ type: 'text', text: 'Hello' }],
      isNewThread: false,
    })
  })

  it('returns 500 when runtime stream throws', async () => {
    const streamFn = vi.fn().mockRejectedValue(new Error('Model unavailable'))
    const app = createMockApp({ stream: streamFn })

    const res = await post(app, '/api/chat', {
      parts: [{ type: 'text', text: 'Hello' }],
    })

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Model unavailable')
  })

  it('returns 500 with generic message for non-Error throws', async () => {
    const streamFn = vi.fn().mockRejectedValue('something broke')
    const app = createMockApp({ stream: streamFn })

    const res = await post(app, '/api/chat', {
      parts: [{ type: 'text', text: 'Hello' }],
    })

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Unknown error')
  })
})

// ---------------------------------------------------------------------------
// Tool approval/denial flow
// ---------------------------------------------------------------------------

describe('POST /api/chat/approve streaming', () => {
  it('calls approveToolCall when approved is true', async () => {
    const approveFn = vi.fn().mockResolvedValue(emptyStream())
    const app = createMockApp({ approveToolCall: approveFn })

    const res = await post(app, '/api/chat/approve', {
      runId: 'run-1',
      threadId: 'thread-1',
      toolCallId: 'tc-1',
      approved: true,
    })

    expect(res.status).toBe(200)
    expect(approveFn).toHaveBeenCalledWith({
      runId: 'run-1',
      toolCallId: 'tc-1',
      threadId: 'thread-1',
      messageId: undefined,
    })
  })

  it('calls declineToolCall when approved is false', async () => {
    const declineFn = vi.fn().mockResolvedValue(emptyStream())
    const app = createMockApp({ declineToolCall: declineFn })

    const res = await post(app, '/api/chat/approve', {
      runId: 'run-1',
      threadId: 'thread-1',
      approved: false,
    })

    expect(res.status).toBe(200)
    expect(declineFn).toHaveBeenCalledWith({
      runId: 'run-1',
      toolCallId: undefined,
      threadId: 'thread-1',
      messageId: undefined,
    })
  })

  it('calls declineToolCall when approved is undefined', async () => {
    const declineFn = vi.fn().mockResolvedValue(emptyStream())
    const app = createMockApp({ declineToolCall: declineFn })

    const res = await post(app, '/api/chat/approve', {
      runId: 'run-1',
      threadId: 'thread-1',
    })

    expect(res.status).toBe(200)
    expect(declineFn).toHaveBeenCalled()
  })

  it('passes messageId through to approve flow', async () => {
    const approveFn = vi.fn().mockResolvedValue(emptyStream())
    const app = createMockApp({ approveToolCall: approveFn })

    await post(app, '/api/chat/approve', {
      runId: 'run-1',
      threadId: 'thread-1',
      messageId: 'msg-42',
      approved: true,
    })

    expect(approveFn).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-42' }))
  })

  it('returns 500 when approval throws', async () => {
    const approveFn = vi.fn().mockRejectedValue(new Error('Run expired'))
    const app = createMockApp({ approveToolCall: approveFn })

    const res = await post(app, '/api/chat/approve', {
      runId: 'run-1',
      threadId: 'thread-1',
      approved: true,
    })

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Run expired')
  })
})

// ---------------------------------------------------------------------------
// Stream resume
// ---------------------------------------------------------------------------

describe('GET /api/chat/:threadId/stream resume', () => {
  it('returns 200 with SSE headers when active stream exists', async () => {
    const resumeStream = new ReadableStream<string>({
      start(controller: ReadableStreamDefaultController<string>): void {
        controller.enqueue('data: test\n\n')
        controller.close()
      },
    })
    const getResumeFn = vi.fn().mockReturnValue(resumeStream)
    const app = createMockApp({ getResume: getResumeFn })

    const res = await app.request('/api/chat/thread-123/stream', { method: 'GET' })

    expect(res.status).toBe(200)
    expect(getResumeFn).toHaveBeenCalledWith('thread-123')
    // Verify SSE headers are set
    const contentType = res.headers.get('content-type')
    expect(contentType).toContain('text/event-stream')
  })

  it('returns 204 when no active stream', async () => {
    const getResumeFn = vi.fn().mockReturnValue(null)
    const app = createMockApp({ getResume: getResumeFn })

    const res = await app.request('/api/chat/thread-456/stream', { method: 'GET' })

    expect(res.status).toBe(204)
  })
})
