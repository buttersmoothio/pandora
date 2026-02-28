import type { ChannelGateway } from '@pandora/core/channels'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTelegramAdapter } from './adapter'

// biome-ignore lint/complexity/noBannedTypes: test mock callback type
type Handler = Function

const mockApi = {
  setMyCommands: vi.fn(),
  sendMessage: vi.fn(),
}

// Mock grammy — each Bot instance gets its own handler/middleware state
vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(() => {
    const handlers: Record<string, Handler> = {}
    const commands: Record<string, Handler> = {}
    const callbackHandlers: { pattern: RegExp; handler: Handler }[] = []
    const middlewares: Handler[] = []

    return {
      api: mockApi,
      use: vi.fn((mw: Handler) => {
        middlewares.push(mw)
      }),
      on: vi.fn((event: string, handler: Handler) => {
        handlers[event] = handler
      }),
      command: vi.fn((cmd: string, handler: Handler) => {
        commands[cmd] = handler
      }),
      callbackQuery: vi.fn((pattern: RegExp, handler: Handler) => {
        callbackHandlers.push({ pattern, handler })
      }),
      catch: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      _handlers: handlers,
      _commands: commands,
      _callbackHandlers: callbackHandlers,
      _middlewares: middlewares,
    }
  }),
  GrammyError: class GrammyError extends Error {},
  HttpError: class HttpError extends Error {},
  InlineKeyboard: vi.fn().mockImplementation(() => ({
    text: vi.fn().mockReturnThis(),
  })),
}))

// Mock format
vi.mock('./format', () => ({
  markdownToHtml: vi.fn((text: string) => `<b>${text}</b>`),
}))

import { Bot } from 'grammy'
import { markdownToHtml } from './format'

const OWNER_ID = '42'

function createMockRuntime(): ChannelGateway {
  return {
    env: { TELEGRAM_BOT_TOKEN: 'test-token' },
    generate: vi.fn().mockResolvedValue({ text: 'AI response' }),
    stream: vi.fn(),
    approveToolCall: vi.fn().mockResolvedValue({ text: 'Approved result' }),
    declineToolCall: vi.fn().mockResolvedValue({ text: 'Declined result' }),
    resolveThread: vi.fn().mockResolvedValue('thread-123'),
    newThread: vi.fn().mockReturnValue('new-thread-456'),
  }
}

function createMockCtx(chatId: number, opts?: { text?: string; fromId?: number }) {
  return {
    chat: { id: chatId },
    from: { id: opts?.fromId ?? chatId },
    message: opts?.text !== undefined ? { text: opts.text } : { text: '' },
    api: mockApi,
    reply: vi.fn(),
    replyWithChatAction: vi.fn(),
  }
}

describe('createTelegramAdapter', () => {
  it('returns adapter with correct id and name', () => {
    const adapter = createTelegramAdapter('test-token', OWNER_ID)
    expect(adapter.id).toBe('telegram')
    expect(adapter.name).toBe('Telegram')
  })

  it('has realtime but no webhook', () => {
    const adapter = createTelegramAdapter('test-token', OWNER_ID)
    expect(adapter.realtime).toBeDefined()
    expect(adapter.webhook).toBeUndefined()
  })
})

describe('realtime', () => {
  let runtime: ChannelGateway
  // biome-ignore lint/suspicious/noExplicitAny: mock instance with private test properties
  let botInstance: any

  beforeEach(async () => {
    vi.clearAllMocks()
    runtime = createMockRuntime()
    const adapter = createTelegramAdapter('test-token', OWNER_ID)
    // biome-ignore lint/style/noNonNullAssertion: realtime is always defined in this adapter
    await adapter.realtime!.start(runtime)
    botInstance = (Bot as unknown as ReturnType<typeof vi.fn>).mock.results[0].value
  })

  it('creates Bot with token', () => {
    expect(Bot).toHaveBeenCalledWith('test-token')
  })

  it('registers owner-only middleware', () => {
    expect(botInstance._middlewares).toHaveLength(1)
  })

  it('registers slash commands with Telegram', () => {
    expect(mockApi.setMyCommands).toHaveBeenCalledWith([
      { command: 'start', description: 'Start the bot' },
      { command: 'new', description: 'Start a fresh conversation' },
    ])
  })

  it('registers command handlers', () => {
    expect(botInstance.command).toHaveBeenCalledWith('start', expect.any(Function))
    expect(botInstance.command).toHaveBeenCalledWith('new', expect.any(Function))
  })

  it('registers message handler', () => {
    expect(botInstance.on).toHaveBeenCalledWith('message:text', expect.any(Function))
  })

  it('calls bot.start()', () => {
    expect(botInstance.start).toHaveBeenCalled()
  })

  it('allows owner through middleware', async () => {
    const ctx = createMockCtx(42, { fromId: 42 })
    const next = vi.fn()
    await botInstance._middlewares[0](ctx, next)

    expect(next).toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('rejects non-owner with private message', async () => {
    const ctx = createMockCtx(99, { fromId: 99 })
    const next = vi.fn()
    await botInstance._middlewares[0](ctx, next)

    expect(next).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith('Sorry, this bot is private.', {
      parse_mode: 'HTML',
    })
  })

  it('silently ignores non-owner updates without message', async () => {
    const ctx = { from: { id: 99 }, chat: { id: 99 }, api: mockApi, reply: vi.fn() }
    const next = vi.fn()
    await botInstance._middlewares[0](ctx, next)

    expect(next).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('handles /start command', async () => {
    const ctx = createMockCtx(42)
    await botInstance._commands.start(ctx)

    expect(runtime.newThread).toHaveBeenCalledWith('telegram', '42')
    expect(ctx.reply).toHaveBeenCalledWith(expect.any(String), { parse_mode: 'HTML' })
  })

  it('handles /new command', async () => {
    const ctx = createMockCtx(42)
    await botInstance._commands.new(ctx)

    expect(runtime.newThread).toHaveBeenCalledWith('telegram', '42')
    expect(ctx.reply).toHaveBeenCalledWith(expect.any(String), { parse_mode: 'HTML' })
  })

  it('handles text messages', async () => {
    const ctx = createMockCtx(42, { text: 'Hello AI' })
    await botInstance._handlers['message:text'](ctx)

    expect(runtime.resolveThread).toHaveBeenCalledWith('telegram', '42')
    expect(runtime.generate).toHaveBeenCalledWith({
      threadId: 'thread-123',
      channelId: 'telegram',
      externalId: '42',
      parts: [{ type: 'text', text: 'Hello AI' }],
    })
    expect(markdownToHtml).toHaveBeenCalledWith('AI response')
    expect(ctx.reply).toHaveBeenCalledWith('<b>AI response</b>', { parse_mode: 'HTML' })
  })

  it('sends typing indicator while generating', async () => {
    const ctx = createMockCtx(42, { text: 'Hello' })
    await botInstance._handlers['message:text'](ctx)

    expect(ctx.replyWithChatAction).toHaveBeenCalledWith('typing')
  })

  it('falls back to plain text when HTML fails', async () => {
    const ctx = createMockCtx(42, { text: 'Hello' })
    ctx.reply.mockRejectedValueOnce(new Error('parse error')).mockResolvedValueOnce({})
    await botInstance._handlers['message:text'](ctx)

    expect(ctx.reply).toHaveBeenCalledTimes(2)
    expect(ctx.reply).toHaveBeenNthCalledWith(1, '<b>AI response</b>', { parse_mode: 'HTML' })
    expect(ctx.reply).toHaveBeenNthCalledWith(2, '<b>AI response</b>')
  })

  it('ignores empty text messages', async () => {
    const ctx = createMockCtx(42, { text: '   ' })
    await botInstance._handlers['message:text'](ctx)

    expect(runtime.resolveThread).not.toHaveBeenCalled()
  })
})

describe('factory export', () => {
  it('factory returns null when token is missing', async () => {
    const { factory } = await import('./index')
    expect(factory({}, { enabled: true, ownerId: '123' })).toBeNull()
  })

  it('factory returns adapter when token is present', async () => {
    const { factory } = await import('./index')
    const adapter = factory({ TELEGRAM_BOT_TOKEN: 'test' }, { enabled: true, ownerId: '123' })
    expect(adapter).not.toBeNull()
    expect(adapter?.id).toBe('telegram')
  })
})
