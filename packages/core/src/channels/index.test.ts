import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChannelAdapter } from './types'

// --- Mocks ---

vi.mock('../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Import after mocks
const {
  loadChannels,
  getChannel,
  getAllChannels,
  handleWebhook,
  verifyWebhook,
  registerChannelPlugin,
  clearChannelPlugins,
} = await import('./index')

// --- Helpers ---

function makeAdapter(id: string, opts?: { webhook?: boolean; realtime?: boolean }): ChannelAdapter {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    ...(opts?.webhook && {
      webhook: {
        verify: vi.fn().mockResolvedValue(true),
        handle: vi.fn().mockResolvedValue(new Response('ok')),
      },
    }),
    ...(opts?.realtime && {
      realtime: { start: vi.fn(), stop: vi.fn() },
    }),
  }
}

// --- Tests ---

describe('loadChannels', () => {
  afterEach(() => {
    clearChannelPlugins()
  })

  it('loads nothing when no plugins are registered', async () => {
    await loadChannels({}, {})
    expect(getAllChannels()).toHaveLength(0)
  })

  it('skips channels explicitly disabled in config', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory: () => adapter,
    })

    await loadChannels({}, { 'channel-telegram': { enabled: false } })
    expect(getChannel('telegram')).toBeUndefined()
  })

  it('loads channel when plugin is registered and factory returns adapter', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory: () => adapter,
    })

    await loadChannels({}, {})
    expect(getChannel('telegram')).toBe(adapter)
    expect(getAllChannels()).toHaveLength(1)
  })

  it('skips channel with configFields when no config entry exists', async () => {
    const factory = vi.fn().mockReturnValue(makeAdapter('telegram'))
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      configFields: [{ key: 'ownerId', label: 'Owner ID', type: 'text', required: true }],
      factory,
    })

    await loadChannels({}, {})
    expect(factory).not.toHaveBeenCalled()
    expect(getAllChannels()).toHaveLength(0)
  })

  it('disables channel when config is invalid', async () => {
    const factory = vi.fn().mockReturnValue(makeAdapter('telegram'))
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      configFields: [{ key: 'ownerId', label: 'Owner ID', type: 'text', required: true }],
      factory,
    })

    // enabled: true but missing required ownerId
    await loadChannels({}, { 'channel-telegram': { enabled: true } })
    expect(factory).not.toHaveBeenCalled()
    expect(getAllChannels()).toHaveLength(0)
  })

  it('skips channel when factory returns null (missing env vars)', async () => {
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory: () => null,
    })

    await loadChannels({}, {})
    expect(getAllChannels()).toHaveLength(0)
  })

  it('passes channel config to factory', async () => {
    const factory = vi.fn().mockReturnValue(makeAdapter('telegram'))
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      configFields: [{ key: 'ownerId', label: 'Owner ID', type: 'text' }],
      factory,
    })

    const channelConfig = { 'channel-telegram': { enabled: true, ownerId: '123' } }
    await loadChannels({}, channelConfig)

    expect(factory).toHaveBeenCalledWith({}, { enabled: true, ownerId: '123' })
  })

  it('provides default config when channel has no config entry', async () => {
    const factory = vi.fn().mockReturnValue(makeAdapter('telegram'))
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory,
    })

    await loadChannels({}, {})

    expect(factory).toHaveBeenCalledWith({}, { enabled: true })
  })
})

describe('getChannel / getAllChannels', () => {
  afterEach(() => {
    clearChannelPlugins()
  })

  it('returns undefined for unknown channel', () => {
    expect(getChannel('nonexistent')).toBeUndefined()
  })

  it('returns empty array when no channels loaded', () => {
    expect(getAllChannels()).toEqual([])
  })
})

describe('handleWebhook', () => {
  afterEach(() => {
    clearChannelPlugins()
  })

  it('returns null for unknown channel', () => {
    const result = handleWebhook('unknown', new Request('http://localhost'), {} as never)
    expect(result).toBeNull()
  })
})

describe('verifyWebhook', () => {
  afterEach(() => {
    clearChannelPlugins()
  })

  it('returns false for unknown channel', async () => {
    const result = await verifyWebhook('unknown', new Request('http://localhost'), {})
    expect(result).toBe(false)
  })

  it('returns false when verify rejects the request', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    vi.mocked(adapter.webhook?.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory: () => adapter,
    })

    await loadChannels({}, {})
    const result = await verifyWebhook('telegram', new Request('http://localhost'), {})
    expect(result).toBe(false)
  })

  it('returns true when verify accepts and passes env through', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory: () => adapter,
    })

    const testEnv = { TELEGRAM_BOT_TOKEN: 'test-token' }
    await loadChannels(testEnv, {})

    const request = new Request('http://localhost')
    const result = await verifyWebhook('telegram', request, testEnv)

    expect(result).toBe(true)
    expect(adapter.webhook?.verify).toHaveBeenCalledWith(request, testEnv)
  })
})

describe('registerChannelPlugin', () => {
  afterEach(() => {
    clearChannelPlugins()
  })

  it('rejects plugins with incompatible schema version', () => {
    expect(() =>
      registerChannelPlugin({
        id: 'bad',
        name: 'Bad',
        schemaVersion: 99,
        envVars: [],
        factory: () => null,
      }),
    ).toThrow(/schema v99/)
  })
})

describe('clearChannelPlugins', () => {
  afterEach(() => {
    clearChannelPlugins()
  })

  it('removes all loaded channels', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    registerChannelPlugin({
      id: 'channel-telegram',
      name: 'Telegram',
      schemaVersion: 1,
      envVars: [],
      factory: () => adapter,
    })

    await loadChannels({}, {})
    expect(getAllChannels()).toHaveLength(1)

    clearChannelPlugins()
    expect(getAllChannels()).toHaveLength(0)
  })
})
