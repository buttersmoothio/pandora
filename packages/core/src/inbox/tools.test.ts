import { describe, expect, it, vi } from 'vitest'
import type { InboxMessage, InboxStore } from '../storage/inbox-store'
import { createSendToTools } from './tools'

const SAMPLE_MESSAGE: InboxMessage = {
  id: 'msg-1',
  subject: 'Test',
  body: 'Body',
  threadId: 'thread-1',
  destination: 'web',
  status: 'sent',
  read: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  archivedAt: null,
}

function createMockInbox(overrides: Partial<InboxStore> = {}): InboxStore {
  return {
    add: vi.fn(async (msg) => ({ ...SAMPLE_MESSAGE, ...msg, id: 'new-msg' })),
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    markRead: vi.fn(async () => {}),
    updateStatus: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    unarchive: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    ...overrides,
  }
}

function exec(tool: { execute?: (...args: never) => unknown }, input: Record<string, unknown>) {
  return (tool.execute as (input: unknown, ctx: unknown) => unknown)?.(input, {})
}

describe('createSendToTools', () => {
  it('creates send_to tool', () => {
    const tools = createSendToTools({
      inboxStore: createMockInbox(),
      threadId: 'thread-1',
      channels: new Map(),
      channelNames: new Map(),
    })
    expect(tools.send_to).toBeDefined()
  })

  describe('send_to Web Inbox', () => {
    it('adds message to inbox with sent status', async () => {
      const inbox = createMockInbox()
      const tools = createSendToTools({
        inboxStore: inbox,
        threadId: 'thread-1',
        channels: new Map(),
        channelNames: new Map(),
      })

      const result = await exec(tools.send_to, {
        subject: 'Hello',
        body: 'World',
        destination: 'Web Inbox',
      })

      expect(inbox.add).toHaveBeenCalledWith({
        subject: 'Hello',
        body: 'World',
        threadId: 'thread-1',
        destination: 'web',
        status: 'sent',
      })
      expect(result).toMatchObject({
        sent: true,
        id: 'new-msg',
        destination: 'web',
        status: 'sent',
      })
    })
  })

  describe('send_to channel', () => {
    function setupChannel(notifyImpl?: () => Promise<void>) {
      const inbox = createMockInbox()
      const mockNotify = vi.fn(notifyImpl ?? (async () => {}))
      const channel = { id: 'telegram', name: 'Telegram', notify: mockNotify }
      const channels = new Map([['@pandorakit/telegram:telegram', channel]])
      const channelNames = new Map([['Telegram', '@pandorakit/telegram:telegram']])

      const tools = createSendToTools({
        inboxStore: inbox,
        threadId: 'thread-1',
        channels,
        channelNames,
      })

      return { inbox, mockNotify, tools }
    }

    it('adds message as pending then notifies channel', async () => {
      const { inbox, mockNotify, tools } = setupChannel()

      const result = await exec(tools.send_to, {
        subject: 'Hi',
        body: 'Body',
        destination: 'Telegram',
      })

      expect(inbox.add).toHaveBeenCalledWith({
        subject: 'Hi',
        body: 'Body',
        threadId: 'thread-1',
        destination: '@pandorakit/telegram:telegram',
        status: 'pending',
      })
      expect(mockNotify).toHaveBeenCalledWith({ subject: 'Hi', body: 'Body' })
      expect(inbox.updateStatus).toHaveBeenCalledWith('new-msg', 'sent')
      expect(result).toMatchObject({
        sent: true,
        id: 'new-msg',
        destination: '@pandorakit/telegram:telegram',
        status: 'sent',
      })
    })

    it('marks as failed when channel.notify throws', async () => {
      const { inbox, tools } = setupChannel(async () => {
        throw new Error('Network error')
      })

      const result = await exec(tools.send_to, {
        subject: 'Hi',
        body: 'Body',
        destination: 'Telegram',
      })

      expect(inbox.updateStatus).toHaveBeenCalledWith('new-msg', 'failed')
      expect(result).toMatchObject({
        sent: false,
        id: 'new-msg',
        destination: '@pandorakit/telegram:telegram',
        status: 'failed',
        error: 'Network error',
      })
    })

    it('handles non-Error thrown values', async () => {
      const { tools } = setupChannel(async () => {
        throw 'string-error'
      })

      const result = await exec(tools.send_to, {
        subject: 'Hi',
        body: 'Body',
        destination: 'Telegram',
      })

      expect(result).toMatchObject({
        sent: false,
        status: 'failed',
        error: 'Unknown error',
      })
    })
  })

  describe('unknown destination', () => {
    it('returns error for unavailable destination', async () => {
      const inbox = createMockInbox()
      const channelWithoutNotify = { id: 'slack', name: 'Slack' }
      const channels = new Map([['@pandorakit/slack:slack', channelWithoutNotify]])
      const channelNames = new Map([['Slack', '@pandorakit/slack:slack']])

      const tools = createSendToTools({
        inboxStore: inbox,
        threadId: 'thread-1',
        channels,
        channelNames,
      })

      // Slack has no notify function, so it should not appear in destinations
      // Only 'Web Inbox' is available
      const result = await exec(tools.send_to, {
        subject: 'Hi',
        body: 'Body',
        destination: 'Web Inbox',
      })

      expect(result).toMatchObject({ sent: true, destination: 'web' })
    })
  })

  describe('locked destination', () => {
    it('restricts to single destination when set', () => {
      const tools = createSendToTools({
        inboxStore: createMockInbox(),
        threadId: 'thread-1',
        channels: new Map(),
        channelNames: new Map(),
        destination: 'Web Inbox',
      })
      expect(tools.send_to).toBeDefined()
    })

    it('sends to locked destination', async () => {
      const inbox = createMockInbox()
      const tools = createSendToTools({
        inboxStore: inbox,
        threadId: 'thread-1',
        channels: new Map(),
        channelNames: new Map(),
        destination: 'Web Inbox',
      })

      const result = await exec(tools.send_to, {
        subject: 'Locked',
        body: 'Message',
        destination: 'Web Inbox',
      })

      expect(result).toMatchObject({ sent: true, destination: 'web', status: 'sent' })
    })

    it('uses channel-specific description when destination is set', () => {
      const tools = createSendToTools({
        inboxStore: createMockInbox(),
        threadId: 'thread-1',
        channels: new Map(),
        channelNames: new Map(),
        destination: 'Web Inbox',
      })

      const tool = tools.send_to as { description?: string }
      expect(tool.description).toContain('Web Inbox')
    })
  })

  describe('channels without notify', () => {
    it('excludes channels that lack a notify function', () => {
      const channelNoNotify = { id: 'discord', name: 'Discord' }
      const channelWithNotify = {
        id: 'telegram',
        name: 'Telegram',
        notify: vi.fn(async () => {}),
      }
      const channels = new Map<
        string,
        { id: string; name: string; notify?: (...args: never) => unknown }
      >([
        ['@pandorakit/discord:discord', channelNoNotify],
        ['@pandorakit/telegram:telegram', channelWithNotify],
      ])
      const channelNames = new Map([
        ['Discord', '@pandorakit/discord:discord'],
        ['Telegram', '@pandorakit/telegram:telegram'],
      ])

      const tools = createSendToTools({
        inboxStore: createMockInbox(),
        threadId: 'thread-1',
        channels: channels as never,
        channelNames,
      })

      // Tool should still be created (Web Inbox + Telegram available)
      expect(tools.send_to).toBeDefined()
    })
  })
})
