import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChannelRuntime } from './runtime'
import type { ChannelRuntime } from './types'

// --- Mocks ---

const mockGenerate = vi.fn()
const mockStream = vi.fn()
const mockGetMemory = vi.fn()
const mockCreateThread = vi.fn()
const mockListThreads = vi.fn()

const mockMastra = {
  getAgent: () => ({
    generate: mockGenerate,
    stream: mockStream,
    getMemory: mockGetMemory,
  }),
} as never

function setupMemoryMock() {
  mockGetMemory.mockResolvedValue({
    createThread: mockCreateThread,
    listThreads: mockListThreads,
  })
}

// --- Tests ---

describe('createChannelRuntime', () => {
  let runtime: ChannelRuntime

  beforeEach(() => {
    runtime = createChannelRuntime({ mastra: mockMastra, env: { FOO: 'bar' } })
    setupMemoryMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes env', () => {
    expect(runtime.env).toEqual({ FOO: 'bar' })
  })

  describe('generate', () => {
    it('calls agent.generate with correct message format and memory option', async () => {
      mockGenerate.mockResolvedValue({
        text: 'Hello!',
        sources: [],
        toolCalls: [],
        toolResults: [],
        files: [],
        reasoning: [],
        reasoningText: undefined,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })

      const result = await runtime.generate({
        threadId: 'thread-1',
        parts: [{ type: 'text', text: 'Hi' }],
      })

      // Verify agent.generate was called
      expect(mockGenerate).toHaveBeenCalledOnce()
      const [messages, options] = mockGenerate.mock.calls[0]

      // Message format
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].parts).toEqual([{ type: 'text', text: 'Hi' }])
      expect(messages[0].id).toBeTypeOf('string')

      // Memory option
      expect(options.memory).toEqual({ thread: 'thread-1', resource: 'default' })

      // Result fields
      expect(result.text).toBe('Hello!')
      expect(result.sources).toEqual([])
      expect(result.usage.inputTokens).toBe(10)
    })

    it('maps all FullOutput fields to GenerateResult', async () => {
      const mockSource = {
        type: 'source',
        payload: { id: 's1', sourceType: 'url', title: 'Test', url: 'https://example.com' },
      }
      const mockToolCall = {
        type: 'tool-call',
        payload: { toolCallId: 'tc1', toolName: 'test', args: {} },
      }
      const mockToolResult = {
        type: 'tool-result',
        payload: { toolCallId: 'tc1', toolName: 'test', result: 'ok' },
      }
      const mockFile = { type: 'file', payload: { data: 'abc', mimeType: 'text/plain' } }
      const mockReasoning = { type: 'reasoning', payload: { id: 'r1', text: 'thinking...' } }

      mockGenerate.mockResolvedValue({
        text: 'Response',
        sources: [mockSource],
        toolCalls: [mockToolCall],
        toolResults: [mockToolResult],
        files: [mockFile],
        reasoning: [mockReasoning],
        reasoningText: 'thinking...',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      })

      const result = await runtime.generate({
        threadId: 'thread-1',
        parts: [{ type: 'text', text: 'test' }],
      })

      expect(result.sources).toEqual([mockSource])
      expect(result.toolCalls).toEqual([mockToolCall])
      expect(result.toolResults).toEqual([mockToolResult])
      expect(result.files).toEqual([mockFile])
      expect(result.reasoning).toEqual([mockReasoning])
      expect(result.reasoningText).toBe('thinking...')
    })
  })

  describe('stream', () => {
    it('calls agent.stream and passes through output fields', async () => {
      const textStream = new ReadableStream<string>()
      mockStream.mockResolvedValue({
        textStream,
        text: Promise.resolve('streamed text'),
        sources: Promise.resolve([]),
        toolCalls: Promise.resolve([]),
        toolResults: Promise.resolve([]),
        files: Promise.resolve([]),
        reasoning: Promise.resolve([]),
        reasoningText: Promise.resolve(undefined),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 3, totalTokens: 8 }),
      })

      const result = await runtime.stream({
        threadId: 'thread-2',
        parts: [{ type: 'text', text: 'stream me' }],
      })

      // Verify agent.stream was called
      expect(mockStream).toHaveBeenCalledOnce()
      const [, options] = mockStream.mock.calls[0]
      expect(options.memory).toEqual({ thread: 'thread-2', resource: 'default' })

      // Stream result has correct structure
      expect(result.textStream).toBe(textStream)
      await expect(result.text).resolves.toBe('streamed text')
      await expect(result.sources).resolves.toEqual([])
      await expect(result.usage).resolves.toEqual({
        inputTokens: 5,
        outputTokens: 3,
        totalTokens: 8,
      })
    })
  })

  describe('resolveThread', () => {
    it('returns existing thread when found', async () => {
      mockListThreads.mockResolvedValue({
        threads: [
          {
            id: 'existing-thread',
            resourceId: 'default',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        page: 0,
        perPage: 1,
        hasMore: false,
      })

      const threadId = await runtime.resolveThread('telegram', '12345')
      expect(threadId).toBe('existing-thread')

      // Verify filter used
      expect(mockListThreads).toHaveBeenCalledWith({
        filter: {
          resourceId: 'default',
          metadata: { channel: 'telegram', externalId: '12345' },
        },
        orderBy: { field: 'updatedAt', direction: 'DESC' },
        perPage: 1,
      })
    })

    it('creates new thread when none found', async () => {
      mockListThreads.mockResolvedValue({
        threads: [],
        total: 0,
        page: 0,
        perPage: 1,
        hasMore: false,
      })

      const threadId = await runtime.resolveThread('telegram', '12345')

      expect(threadId).toBeTypeOf('string')
      // Thread is NOT pre-created — metadata is deferred to generate/stream
      expect(mockCreateThread).not.toHaveBeenCalled()
    })
  })

  describe('newThread', () => {
    it('returns a thread ID without pre-creating in DB', async () => {
      const threadId = await runtime.newThread('discord', 'channel-99')

      expect(threadId).toBeTypeOf('string')
      // Thread is NOT pre-created — Mastra will create it during generate/stream
      expect(mockCreateThread).not.toHaveBeenCalled()
    })

    it('passes stashed metadata through generate memory option', async () => {
      mockGenerate.mockResolvedValue({
        text: 'Hi',
        sources: [],
        toolCalls: [],
        toolResults: [],
        files: [],
        reasoning: [],
        reasoningText: undefined,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      })

      const threadId = await runtime.newThread('discord', 'channel-99')
      await runtime.generate({ threadId, parts: [{ type: 'text', text: 'hey' }] })

      const [, options] = mockGenerate.mock.calls[0]
      expect(options.memory).toEqual({
        thread: {
          id: threadId,
          metadata: { channel: 'discord', externalId: 'channel-99', root: true },
        },
        resource: 'default',
      })
    })

    it('uses plain thread ID for existing threads', async () => {
      mockGenerate.mockResolvedValue({
        text: 'Hi',
        sources: [],
        toolCalls: [],
        toolResults: [],
        files: [],
        reasoning: [],
        reasoningText: undefined,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      })

      // generate with a thread ID that was NOT created via newThread
      await runtime.generate({ threadId: 'existing-id', parts: [{ type: 'text', text: 'hey' }] })

      const [, options] = mockGenerate.mock.calls[0]
      expect(options.memory).toEqual({ thread: 'existing-id', resource: 'default' })
    })
  })
})
