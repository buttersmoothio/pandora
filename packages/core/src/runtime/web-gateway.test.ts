import { describe, expect, it, vi } from 'vitest'

const mockGetAgent = vi.fn()
const mockMastra = { getAgent: mockGetAgent }

vi.mock('@mastra/ai-sdk', () => ({
  toAISdkStream: vi.fn(() => {
    return new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
  }),
}))

const { createWebGateway } = await import('./web-gateway')
const { toAISdkStream } = await import('@mastra/ai-sdk')

describe('web gateway', () => {
  it('stream calls agent.stream with correct memory for new thread', async () => {
    const mockStream = vi.fn()
    mockGetAgent.mockReturnValue({
      stream: mockStream.mockResolvedValue({
        textStream: new ReadableStream(),
      }),
    })

    const web = createWebGateway({ mastra: mockMastra as never })
    await web.stream({
      threadId: 'new-thread',
      parts: [{ type: 'text', text: 'Hello' }],
      isNewThread: true,
    })

    expect(mockStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        memory: {
          thread: { id: 'new-thread', metadata: { root: true } },
          resource: 'default',
        },
      }),
    )
  })

  it('stream calls agent.stream with threadId string for existing thread', async () => {
    const mockStream = vi.fn()
    mockGetAgent.mockReturnValue({
      stream: mockStream.mockResolvedValue({
        textStream: new ReadableStream(),
      }),
    })

    const web = createWebGateway({ mastra: mockMastra as never })
    await web.stream({
      threadId: 'existing-thread',
      parts: [{ type: 'text', text: 'Hello' }],
      isNewThread: false,
    })

    expect(mockStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        memory: { thread: 'existing-thread', resource: 'default' },
      }),
    )
  })
})

describe('approval transform', () => {
  it('converts data-tool-call-approval to tool-approval-request', async () => {
    vi.mocked(toAISdkStream).mockReturnValueOnce(
      new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'data-tool-call-approval',
            data: { runId: 'run-1', toolCallId: 'tc-1' },
          })
          controller.close()
        },
      }),
    )
    mockGetAgent.mockReturnValue({
      stream: vi.fn().mockResolvedValue({ textStream: new ReadableStream() }),
    })

    const web = createWebGateway({ mastra: mockMastra as never })
    const stream = await web.stream({
      threadId: 'thread-1',
      parts: [{ type: 'text', text: 'hi' }],
    })

    const reader = stream.getReader()
    const { value } = await reader.read()
    expect(value).toEqual({
      type: 'tool-approval-request',
      approvalId: 'run-1',
      toolCallId: 'tc-1',
    })
  })

  it('suppresses data-tool-call-suspended chunks', async () => {
    vi.mocked(toAISdkStream).mockReturnValueOnce(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'data-tool-call-suspended', data: null })
          controller.enqueue({ type: 'text-delta', id: 't1', delta: 'hello' })
          controller.close()
        },
      }),
    )
    mockGetAgent.mockReturnValue({
      stream: vi.fn().mockResolvedValue({ textStream: new ReadableStream() }),
    })

    const web = createWebGateway({ mastra: mockMastra as never })
    const stream = await web.stream({
      threadId: 'thread-1',
      parts: [{ type: 'text', text: 'hi' }],
    })

    const chunks: unknown[] = []
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: 'text-delta', id: 't1', delta: 'hello' })
  })

  it('passes through regular chunks unchanged', async () => {
    const chunk = { type: 'text-delta' as const, id: 't1', delta: 'world' }
    vi.mocked(toAISdkStream).mockReturnValueOnce(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk)
          controller.close()
        },
      }),
    )
    mockGetAgent.mockReturnValue({
      stream: vi.fn().mockResolvedValue({ textStream: new ReadableStream() }),
    })

    const web = createWebGateway({ mastra: mockMastra as never })
    const stream = await web.stream({
      threadId: 'thread-1',
      parts: [{ type: 'text', text: 'hi' }],
    })

    const reader = stream.getReader()
    const { value } = await reader.read()
    expect(value).toEqual(chunk)
  })
})

describe('web gateway approve/decline', () => {
  it('approveToolCall calls agent with correct args', async () => {
    const mockApprove = vi.fn().mockResolvedValue({ textStream: new ReadableStream() })
    mockGetAgent.mockReturnValue({ approveToolCall: mockApprove })

    const web = createWebGateway({ mastra: mockMastra as never })
    const stream = await web.approveToolCall({
      runId: 'run-1',
      toolCallId: 'tc-1',
      threadId: 'thread-1',
      messageId: 'msg-1',
    })

    expect(mockApprove).toHaveBeenCalledWith({
      runId: 'run-1',
      toolCallId: 'tc-1',
      memory: { thread: 'thread-1', resource: 'default' },
    })
    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('approveToolCall omits toolCallId when not provided', async () => {
    const mockApprove = vi.fn().mockResolvedValue({ textStream: new ReadableStream() })
    mockGetAgent.mockReturnValue({ approveToolCall: mockApprove })

    const web = createWebGateway({ mastra: mockMastra as never })
    await web.approveToolCall({ runId: 'run-1', threadId: 'thread-1' })

    expect(mockApprove).toHaveBeenCalledWith({
      runId: 'run-1',
      memory: { thread: 'thread-1', resource: 'default' },
    })
  })

  it('approveToolCall passes lastMessageId to stream converter', async () => {
    const mockApprove = vi.fn().mockResolvedValue({ textStream: new ReadableStream() })
    mockGetAgent.mockReturnValue({ approveToolCall: mockApprove })

    const web = createWebGateway({ mastra: mockMastra as never })
    await web.approveToolCall({
      runId: 'run-1',
      threadId: 'thread-1',
      messageId: 'msg-42',
    })

    expect(vi.mocked(toAISdkStream)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lastMessageId: 'msg-42' }),
    )
  })

  it('declineToolCall calls agent with correct args', async () => {
    const mockDecline = vi.fn().mockResolvedValue({ textStream: new ReadableStream() })
    mockGetAgent.mockReturnValue({ declineToolCall: mockDecline })

    const web = createWebGateway({ mastra: mockMastra as never })
    const stream = await web.declineToolCall({
      runId: 'run-1',
      toolCallId: 'tc-1',
      threadId: 'thread-1',
    })

    expect(mockDecline).toHaveBeenCalledWith({
      runId: 'run-1',
      toolCallId: 'tc-1',
      memory: { thread: 'thread-1', resource: 'default' },
    })
    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('declineToolCall omits toolCallId when not provided', async () => {
    const mockDecline = vi.fn().mockResolvedValue({ textStream: new ReadableStream() })
    mockGetAgent.mockReturnValue({ declineToolCall: mockDecline })

    const web = createWebGateway({ mastra: mockMastra as never })
    await web.declineToolCall({ runId: 'run-1', threadId: 'thread-1' })

    expect(mockDecline).toHaveBeenCalledWith({
      runId: 'run-1',
      memory: { thread: 'thread-1', resource: 'default' },
    })
  })
})
