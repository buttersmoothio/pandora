import { describe, expect, it, vi } from 'vitest'
import { createChannelGateway } from '../channel-gateway'

const mockGetAgent: ReturnType<typeof vi.fn> = vi.fn()
const mockMastra: { getAgent: ReturnType<typeof vi.fn> } = { getAgent: mockGetAgent }

describe('channel gateway', () => {
  it('creates a gateway with env and logger', () => {
    const env = { API_KEY: 'test' }
    const channel = createChannelGateway({ mastra: mockMastra as never, env })
    const gw = channel('test-channel')

    expect(gw.env).toBe(env)
    expect(gw.logger).toBeDefined()
    expect(gw.logger.log).toBeTypeOf('function')
    expect(gw.logger.warn).toBeTypeOf('function')
    expect(gw.logger.error).toBeTypeOf('function')
  })

  it('newThread returns a UUID and stores pending metadata', () => {
    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

    const threadId = gw.newThread('telegram', 'user-123')
    expect(threadId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('resolveThread returns pending thread if available', async () => {
    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

    const threadId = gw.newThread('telegram', 'user-456')
    const resolved = await gw.resolveThread('telegram', 'user-456')
    expect(resolved).toBe(threadId)
  })

  it('concurrent resolveThread calls for same key return same thread', async () => {
    const mockMemory = {
      listThreads: vi.fn().mockResolvedValue({ threads: [] }),
    }
    mockGetAgent.mockReturnValue({
      getMemory: vi.fn().mockResolvedValue(mockMemory),
    })

    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

    // Fire two concurrent resolveThread calls for the same user
    const [id1, id2] = await Promise.all([
      gw.resolveThread('telegram', 'race-user'),
      gw.resolveThread('telegram', 'race-user'),
    ])

    // Both must resolve to the same thread
    expect(id1).toBe(id2)
    // Memory should only be queried once (second call reuses the lock)
    expect(mockMemory.listThreads).toHaveBeenCalledTimes(1)
  })

  it('resolveThread queries memory when no pending thread exists', async () => {
    const mockMemory = {
      listThreads: vi.fn().mockResolvedValue({ threads: [{ id: 'existing-thread' }] }),
    }
    mockGetAgent.mockReturnValue({
      getMemory: vi.fn().mockResolvedValue(mockMemory),
    })

    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

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

    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

    const genResult = await gw.generate({
      threadId: 'thread-1',
      parts: [{ type: 'text', text: 'Hi' }],
    })
    expect(genResult.text).toBe('Hello!')
    expect(genResult.usage.inputTokens).toBe(10)
    expect(genResult.runId).toBe('run-1')
  })

  it('generate maps suspended result to pendingToolApproval', async () => {
    const mockResult = {
      text: '',
      sources: [],
      toolCalls: [{ payload: { toolCallId: 'tc-1', toolName: 'dangerous_tool', args: { x: 1 } } }],
      toolResults: [],
      files: [],
      reasoning: [],
      reasoningText: null,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      runId: 'run-1',
      finishReason: 'suspended',
      suspendPayload: { toolCallId: 'tc-1', toolName: 'dangerous_tool', args: { x: 1 } },
    }
    mockGetAgent.mockReturnValue({
      generate: vi.fn().mockResolvedValue(mockResult),
    })

    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

    const genResult = await gw.generate({
      threadId: 'thread-1',
      parts: [{ type: 'text', text: 'do something' }],
    })
    expect(genResult.pendingToolApproval).toEqual({
      toolCallId: 'tc-1',
      toolName: 'dangerous_tool',
      args: { x: 1 },
    })
  })

  it('generate returns no pendingToolApproval for normal finish', async () => {
    const mockResult = {
      text: 'Done',
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

    const channel = createChannelGateway({ mastra: mockMastra as never, env: {} })
    const gw = channel()

    const genResult = await gw.generate({
      threadId: 'thread-1',
      parts: [{ type: 'text', text: 'hi' }],
    })
    expect(genResult.pendingToolApproval).toBeUndefined()
  })
})
