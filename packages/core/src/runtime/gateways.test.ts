import { describe, expect, it, vi } from 'vitest'

// Mock mastra to avoid real agent creation
const mockGetAgent = vi.fn()
const mockMastra = { getAgent: mockGetAgent }

// Mock the mastra stream converter
vi.mock('@mastra/ai-sdk', () => ({
  toAISdkStream: vi.fn(() => {
    // Return a simple passthrough for testing the approval transform
    return new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
  }),
}))

const { createGateways } = await import('./gateways')

describe('createGateways', () => {
  it('returns channel and web gateway factories', () => {
    const result = createGateways({ mastra: mockMastra as never, env: {} })
    expect(result.channel).toBeTypeOf('function')
    expect(result.web).toBeDefined()
    expect(result.web.stream).toBeTypeOf('function')
    expect(result.web.approveToolCall).toBeTypeOf('function')
    expect(result.web.declineToolCall).toBeTypeOf('function')
  })

  describe('channel gateway', () => {
    it('creates a gateway with env and logger', () => {
      const env = { API_KEY: 'test' }
      const result = createGateways({ mastra: mockMastra as never, env })
      const gw = result.channel('test-channel')

      expect(gw.env).toBe(env)
      expect(gw.logger).toBeDefined()
      expect(gw.logger.log).toBeTypeOf('function')
      expect(gw.logger.warn).toBeTypeOf('function')
      expect(gw.logger.error).toBeTypeOf('function')
    })

    it('newThread returns a UUID and stores pending metadata', () => {
      const result = createGateways({ mastra: mockMastra as never, env: {} })
      const gw = result.channel()

      const threadId = gw.newThread('telegram', 'user-123')
      expect(threadId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('resolveThread returns pending thread if available', async () => {
      const result = createGateways({ mastra: mockMastra as never, env: {} })
      const gw = result.channel()

      const threadId = gw.newThread('telegram', 'user-456')
      const resolved = await gw.resolveThread('telegram', 'user-456')
      expect(resolved).toBe(threadId)
    })

    it('resolveThread queries memory when no pending thread exists', async () => {
      const mockMemory = {
        listThreads: vi.fn().mockResolvedValue({ threads: [{ id: 'existing-thread' }] }),
      }
      mockGetAgent.mockReturnValue({
        getMemory: vi.fn().mockResolvedValue(mockMemory),
      })

      const result = createGateways({ mastra: mockMastra as never, env: {} })
      const gw = result.channel()

      const resolved = await gw.resolveThread('telegram', 'new-user')
      expect(resolved).toBe('existing-thread')
      expect(mockMemory.listThreads).toHaveBeenCalledWith({
        filter: {
          resourceId: 'default',
          metadata: { channel: 'telegram', externalId: 'new-user' },
        },
        orderBy: { field: 'updatedAt', direction: 'DESC' },
        perPage: 1,
      })
    })

    it('generate calls agent.generate and builds result', async () => {
      const mockResult = {
        text: 'Hello!',
        sources: [],
        toolCalls: [],
        toolResults: [],
        files: [],
        reasoning: [],
        reasoningText: null,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        runId: 'run-1',
        finishReason: 'stop',
      }
      mockGetAgent.mockReturnValue({
        generate: vi.fn().mockResolvedValue(mockResult),
      })

      const result = createGateways({ mastra: mockMastra as never, env: {} })
      const gw = result.channel()

      const genResult = await gw.generate({
        threadId: 'thread-1',
        parts: [{ type: 'text', text: 'Hi' }],
      })
      expect(genResult.text).toBe('Hello!')
      expect(genResult.usage.inputTokens).toBe(10)
      expect(genResult.runId).toBe('run-1')
    })
  })

  describe('web gateway', () => {
    it('stream calls agent.stream with correct memory for new thread', async () => {
      const mockStream = vi.fn()
      mockGetAgent.mockReturnValue({
        stream: mockStream.mockResolvedValue({
          textStream: new ReadableStream(),
        }),
      })

      const result = createGateways({ mastra: mockMastra as never, env: {} })
      await result.web.stream({
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

      const result = createGateways({ mastra: mockMastra as never, env: {} })
      await result.web.stream({
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
})
