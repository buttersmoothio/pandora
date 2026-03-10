import { describe, expect, it, vi } from 'vitest'
import type { PluginRegistry } from './plugin-registry'
import { createPluginRegistry } from './plugin-registry'

// ── Hoisted stubs (available inside vi.mock factories) ─────────────────

const {
  stubStorage,
  stubScheduler,
  stubMcpManager,
  stubMastra,
  stubWebGateway,
  mockSchedulerSync,
  mockSchedulerStop,
  mockMcpDisconnect,
} = vi.hoisted(() => {
  const mockSchedulerSync = vi.fn()
  const mockSchedulerStop = vi.fn()
  const stubScheduler = {
    sync: mockSchedulerSync,
    stop: mockSchedulerStop,
    nextRun: vi.fn(),
    isRunning: vi.fn(),
  }

  const mockMcpDisconnect = vi.fn().mockResolvedValue(undefined)
  const stubMcpManager = {
    tools: {},
    serverMeta: new Map(),
    disconnect: mockMcpDisconnect,
    handleOAuthCallback: vi.fn(),
  }

  const stubMastra = {
    getAgent: vi.fn().mockReturnValue({
      generate: vi.fn(),
      stream: vi.fn(),
      getMemory: vi.fn(),
    }),
  }

  const stubWebGateway = {
    stream: vi.fn(),
    approveToolCall: vi.fn(),
    declineToolCall: vi.fn(),
  }

  const stubStorage = {
    mastra: {},
    config: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
    auth: {},
    inbox: {},
    mcpOAuth: {},
    close: vi.fn().mockResolvedValue(undefined),
  }

  return {
    stubStorage,
    stubScheduler,
    stubMcpManager,
    stubMastra,
    stubWebGateway,
    mockSchedulerSync,
    mockSchedulerStop,
    mockMcpDisconnect,
  }
})

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../storage', () => ({
  createStorage: vi.fn().mockResolvedValue(stubStorage),
}))

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>()
  const stubConfig = { ...actual.DEFAULTS }
  return {
    ...actual,
    getConfig: vi.fn().mockResolvedValue(stubConfig),
    updateConfig: vi.fn().mockResolvedValue(stubConfig),
  }
})

vi.mock('../mcp', () => ({
  createMcpManager: vi.fn().mockResolvedValue(stubMcpManager),
}))

vi.mock('../memory', () => ({
  createMemory: vi.fn().mockReturnValue({}),
}))

vi.mock('../scheduler', () => ({
  createScheduler: vi.fn().mockReturnValue(stubScheduler),
}))

vi.mock('../scheduler/tools', () => ({
  createScheduleTools: vi.fn().mockReturnValue({}),
}))

vi.mock('../scheduler/heartbeat', () => ({
  HEARTBEAT_TASK_ID: '__heartbeat__',
  createHeartbeatTask: vi.fn().mockReturnValue({ id: '__heartbeat__', cron: '*/30 * * * *' }),
  isWithinActiveHours: vi.fn().mockReturnValue(true),
  buildHeartbeatPrompt: vi.fn().mockReturnValue('heartbeat prompt'),
}))

vi.mock('../inbox/tools', () => ({
  createSendToTools: vi.fn().mockReturnValue({}),
}))

vi.mock('../tools/current-time', () => ({
  createCurrentTimeTool: vi.fn().mockReturnValue({ id: 'current_time' }),
}))

vi.mock('./load-tools', () => ({
  loadTools: vi.fn().mockResolvedValue({}),
}))

vi.mock('./load-agents', () => ({
  loadAgents: vi.fn().mockResolvedValue({}),
}))

vi.mock('./load-channels', () => ({
  loadChannels: vi.fn().mockResolvedValue({ channels: new Map(), channelNames: new Map() }),
}))

vi.mock('./gateways', () => ({
  createGateways: vi.fn().mockReturnValue({
    web: stubWebGateway,
    channel: vi.fn(),
  }),
}))

vi.mock('../agents/operator', () => ({
  createOperator: vi.fn().mockReturnValue({ id: 'operator' }),
}))

vi.mock('@mastra/core', () => ({
  Mastra: vi.fn().mockImplementation(() => stubMastra),
}))

vi.mock('./stream-store', () => ({
  storeStream: vi.fn(),
  getResumeStream: vi.fn(),
  getActiveStreamIds: vi.fn().mockReturnValue([]),
}))

vi.mock('../logger', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { createRuntime } = await import('./pandora-runtime')
const { DEFAULTS } = await import('../config')

// ── Helpers ────────────────────────────────────────────────────────────

const stubConfig = { ...DEFAULTS }

function makeRegistry(): PluginRegistry {
  return createPluginRegistry()
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('createRuntime', () => {
  it('returns a runtime with all expected properties', async () => {
    const registry = makeRegistry()
    const runtime = await createRuntime(registry, {})

    expect(runtime.registry).toBe(registry)
    expect(runtime.storage).toBe(stubStorage)
    expect(runtime.config).toBeDefined()
    expect(runtime.mastra).toBeDefined()
    expect(runtime.channels).toBeInstanceOf(Map)
    expect(runtime.channelNames).toBeInstanceOf(Map)
    expect(runtime.interactiveTools).toBeDefined()
    expect(runtime.scheduler).toBe(stubScheduler)
    expect(runtime.web).toBeDefined()
    expect(runtime.streams).toBeDefined()
    expect(runtime.streams.store).toBeTypeOf('function')
    expect(runtime.streams.getResume).toBeTypeOf('function')
    expect(runtime.streams.getActiveIds).toBeTypeOf('function')
  })

  it('exposes reload, syncSchedule, and close methods', async () => {
    const runtime = await createRuntime(makeRegistry(), {})

    expect(runtime.reload).toBeTypeOf('function')
    expect(runtime.syncSchedule).toBeTypeOf('function')
    expect(runtime.close).toBeTypeOf('function')
  })

  it('calls syncSchedule during initialization', async () => {
    mockSchedulerSync.mockClear()
    mockSchedulerStop.mockClear()

    await createRuntime(makeRegistry(), {})

    // Default config has schedule.enabled = true, so sync should be called
    expect(mockSchedulerSync).toHaveBeenCalled()
  })
})

describe('runtime.syncSchedule', () => {
  it('calls scheduler.sync when schedule is enabled', async () => {
    mockSchedulerSync.mockClear()
    const runtime = await createRuntime(makeRegistry(), {})
    mockSchedulerSync.mockClear()

    runtime.syncSchedule()

    expect(mockSchedulerSync).toHaveBeenCalledWith(expect.any(Array), runtime.config.timezone)
  })

  it('calls scheduler.stop when schedule is disabled', async () => {
    mockSchedulerStop.mockClear()
    const runtime = await createRuntime(makeRegistry(), {})
    runtime.config = { ...runtime.config, schedule: { ...runtime.config.schedule, enabled: false } }
    mockSchedulerStop.mockClear()

    runtime.syncSchedule()

    expect(mockSchedulerStop).toHaveBeenCalled()
  })
})

describe('runtime.close', () => {
  it('stops scheduler, MCP, and storage', async () => {
    mockSchedulerStop.mockClear()
    mockMcpDisconnect.mockClear()
    stubStorage.close.mockClear()

    const runtime = await createRuntime(makeRegistry(), {})
    await runtime.close()

    expect(mockSchedulerStop).toHaveBeenCalled()
    expect(stubStorage.close).toHaveBeenCalled()
  })
})

describe('runtime.reload', () => {
  it('re-reads config and rebuilds state', async () => {
    const { getConfig } = await import('../config')
    const runtime = await createRuntime(makeRegistry(), {})

    vi.mocked(getConfig).mockClear()

    await runtime.reload()

    expect(getConfig).toHaveBeenCalled()
  })

  it('disconnects MCP manager during reload', async () => {
    const runtime = await createRuntime(makeRegistry(), {})
    mockMcpDisconnect.mockClear()

    await runtime.reload()

    expect(mockMcpDisconnect).toHaveBeenCalled()
  })

  it('serializes concurrent reload calls', async () => {
    const runtime = await createRuntime(makeRegistry(), {})

    const order: number[] = []
    const { getConfig } = await import('../config')
    let callCount = 0
    vi.mocked(getConfig).mockImplementation(async () => {
      const n = ++callCount
      order.push(n)
      // Simulate async work — second call should wait for first
      await new Promise((r) => setTimeout(r, 50))
      order.push(n * 10)
      return stubConfig
    })

    // Fire two concurrent reloads
    const p1 = runtime.reload()
    const p2 = runtime.reload()
    await Promise.all([p1, p2])

    // If serialized: [1, 10, 2, 20] — first completes before second starts
    // If NOT serialized: [1, 2, 10, 20] — both start before either completes
    expect(order[0]).toBe(1)
    expect(order[1]).toBe(10)
    expect(order[2]).toBe(2)
    expect(order[3]).toBe(20)
  })
})

describe('getBackgroundTools (via runtime)', () => {
  it('interactive tools exclude background-only tools', async () => {
    const { loadTools } = await import('./load-tools')
    vi.mocked(loadTools).mockResolvedValueOnce({
      'mcp:readonly-tool': {
        id: 'readonly-tool',
        mcp: { annotations: { readOnlyHint: true } },
        execute: vi.fn(),
      } as never,
      'plugin:approval-tool': {
        id: 'approval-tool',
        requireApproval: true,
        execute: vi.fn(),
      } as never,
      'plugin:normal-tool': {
        id: 'normal-tool',
        execute: vi.fn(),
      } as never,
    })

    const runtime = await createRuntime(makeRegistry(), {})

    // normal-tool and approval-tool should be interactive (not background)
    // readonly MCP tool without requireApproval is background-only, so NOT in interactive
    expect(runtime.interactiveTools).toHaveProperty('plugin:normal-tool')
    expect(runtime.interactiveTools).toHaveProperty('plugin:approval-tool')
    expect(runtime.interactiveTools).not.toHaveProperty('mcp:readonly-tool')
  })
})
