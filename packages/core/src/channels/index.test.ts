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
  clearChannelRegistry,
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
    clearChannelRegistry()
  })

  it('skips channels when package is not installed', async () => {
    // No @pandora/channel-* packages exist, loadChannels should not throw
    await loadChannels({}, {})
    expect(getAllChannels()).toHaveLength(0)
  })

  it('skips channels explicitly disabled in config', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    vi.doMock('@pandora/channel-telegram', () => ({ default: () => adapter }))

    await loadChannels({}, { telegram: { enabled: false } })
    // Channel is disabled — should not be loaded even though package exists
    expect(getChannel('telegram')).toBeUndefined()

    vi.doUnmock('@pandora/channel-telegram')
  })

  it('loads channel when package exists and factory returns adapter', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    vi.doMock('@pandora/channel-telegram', () => ({ default: () => adapter }))

    await loadChannels({}, {})
    expect(getChannel('telegram')).toBe(adapter)
    expect(getAllChannels()).toHaveLength(1)

    vi.doUnmock('@pandora/channel-telegram')
  })
})

describe('getChannel / getAllChannels', () => {
  afterEach(() => {
    clearChannelRegistry()
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
    clearChannelRegistry()
  })

  it('returns null for unknown channel', () => {
    const result = handleWebhook('unknown', new Request('http://localhost'), {} as never)
    expect(result).toBeNull()
  })
})

describe('verifyWebhook', () => {
  afterEach(() => {
    clearChannelRegistry()
  })

  it('returns false for unknown channel', async () => {
    const result = await verifyWebhook('unknown', new Request('http://localhost'), {})
    expect(result).toBe(false)
  })

  it('returns false when verify rejects the request', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    vi.mocked(adapter.webhook?.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    vi.doMock('@pandora/channel-telegram', () => ({ default: () => adapter }))

    await loadChannels({}, {})
    const result = await verifyWebhook('telegram', new Request('http://localhost'), {})
    expect(result).toBe(false)

    vi.doUnmock('@pandora/channel-telegram')
  })

  it('returns true when verify accepts and passes env through', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    vi.doMock('@pandora/channel-telegram', () => ({ default: () => adapter }))

    const testEnv = { TELEGRAM_BOT_TOKEN: 'test-token' }
    await loadChannels(testEnv, {})

    const request = new Request('http://localhost')
    const result = await verifyWebhook('telegram', request, testEnv)

    expect(result).toBe(true)
    expect(adapter.webhook?.verify).toHaveBeenCalledWith(request, testEnv)

    vi.doUnmock('@pandora/channel-telegram')
  })
})

describe('clearChannelRegistry', () => {
  afterEach(() => {
    clearChannelRegistry()
  })

  it('removes all loaded channels', async () => {
    const adapter = makeAdapter('telegram', { webhook: true })
    vi.doMock('@pandora/channel-telegram', () => ({ default: () => adapter }))

    await loadChannels({}, {})
    expect(getAllChannels()).toHaveLength(1)

    clearChannelRegistry()
    expect(getAllChannels()).toHaveLength(0)

    vi.doUnmock('@pandora/channel-telegram')
  })
})
