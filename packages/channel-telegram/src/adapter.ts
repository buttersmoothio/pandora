import type { ChannelAdapter, ChannelRealtime, GenerateResult } from '@pandora/core/channels'
import type { Context } from 'grammy'
import { Bot, GrammyError, HttpError, InlineKeyboard } from 'grammy'
import { markdownToHtml } from './format'
import { splitMessage } from './telegram-api'

const CHANNEL_ID = 'telegram'

const NEW_THREAD_GREETINGS = [
  'New conversation started. What\u2019s up?',
  'Fresh start. What are we working on?',
  'Clean slate. Go ahead.',
  'Ready. What do you need?',
]

function randomGreeting(): string {
  return NEW_THREAD_GREETINGS[Math.floor(Math.random() * NEW_THREAD_GREETINGS.length)] as string
}

/**
 * Send a reply via grammY, splitting long messages and falling back
 * to plain text if HTML parsing fails.
 */
async function reply(ctx: Context, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML' })
    } catch {
      await ctx.reply(chunk)
    }
  }
}

/** Format tool args as a readable key-value list */
function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const entries = Object.entries(args as Record<string, unknown>)
  if (entries.length === 0) return ''
  return entries
    .map(([key, value]) => {
      const formatted = typeof value === 'string' ? value : JSON.stringify(value)
      return `• <b>${key}:</b> ${formatted}`
    })
    .join('\n')
}

/** Send the result to the chat — either an approval keyboard or text reply. */
function sendResult(
  ctx: Context,
  result: GenerateResult,
  pendingApprovals: Map<string, { runId: string; toolCallId: string }>,
  nextId: () => string,
): Promise<void> {
  if (result.pendingToolApproval && result.runId) {
    const { toolCallId, toolName, args } = result.pendingToolApproval
    const id = nextId()
    pendingApprovals.set(id, { runId: result.runId, toolCallId })

    const keyboard = new InlineKeyboard().text('Approve', `a:${id}`).text('Deny', `d:${id}`)

    const argsText = formatArgs(args)
    const message = argsText
      ? `<b>${toolName}</b> wants to run:\n${argsText}`
      : `<b>${toolName}</b> wants to run`

    return ctx
      .reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      .then(() => {})
  }
  if (result.text) {
    return reply(ctx, markdownToHtml(result.text))
  }
  return Promise.resolve()
}

export function createTelegramAdapter(token: string, ownerId: string): ChannelAdapter {
  let bot: Bot | null = null

  // Store pending approvals — Telegram callback data has 64-byte limit, so we
  // use short IDs and look up the full runId/toolCallId from this map.
  let approvalCounter = 0
  const pendingApprovals = new Map<string, { runId: string; toolCallId: string }>()

  const realtime: ChannelRealtime = {
    async start(runtime) {
      bot = new Bot(token)

      // Owner-only guard: reject messages from non-owners
      bot.use(async (ctx, next) => {
        const userId = ctx.from?.id.toString()
        if (userId !== ownerId) {
          if (ctx.message) {
            await reply(ctx, 'Sorry, this bot is private.')
          }
          return
        }
        await next()
      })

      await bot.api.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'new', description: 'Start a fresh conversation' },
      ])

      for (const cmd of ['start', 'new'] as const) {
        bot.command(cmd, async (ctx) => {
          const chatId = ctx.chat.id
          await runtime.newThread(CHANNEL_ID, String(chatId))
          await reply(ctx, randomGreeting())
        })
      }

      bot.on('message:text', async (ctx) => {
        const text = ctx.message.text.trim()
        if (!text) return

        const chatId = String(ctx.chat.id)
        const threadId = await runtime.resolveThread(CHANNEL_ID, chatId)

        await ctx.replyWithChatAction('typing')
        const typingInterval = setInterval(
          () => ctx.replyWithChatAction('typing').catch(() => {}),
          5_000,
        )

        const nextId = () => String(++approvalCounter)

        try {
          const result = await runtime.generate({
            threadId,
            channelId: CHANNEL_ID,
            externalId: chatId,
            parts: [{ type: 'text', text }],
          })
          await sendResult(ctx, result, pendingApprovals, nextId)
        } finally {
          clearInterval(typingInterval)
        }
      })

      bot.callbackQuery(/^(a|d):(\d+)$/, async (ctx) => {
        const match = ctx.match as RegExpMatchArray
        const [, action, id] = match
        const pending = pendingApprovals.get(id)
        if (!pending) {
          await ctx.answerCallbackQuery('Approval expired')
          return
        }
        pendingApprovals.delete(id)

        const { runId, toolCallId } = pending
        await ctx.answerCallbackQuery(action === 'a' ? 'Approved' : 'Denied')
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })

        await ctx.replyWithChatAction('typing')
        const nextId = () => String(++approvalCounter)
        const result =
          action === 'a'
            ? await runtime.approveToolCall({ runId, toolCallId })
            : await runtime.declineToolCall({ runId, toolCallId })

        await sendResult(ctx, result, pendingApprovals, nextId)
      })

      bot.catch((err) => {
        const e = err.error
        if (e instanceof GrammyError) {
          console.error('Telegram API error:', e.description)
        } else if (e instanceof HttpError) {
          console.error('Telegram network error:', e.message)
        } else {
          console.error('Grammy error:', e)
        }
      })

      // Start long-polling (non-blocking)
      bot.start()
    },

    async stop() {
      if (bot) {
        try {
          await bot.stop()
        } catch {
          // 409 "Conflict" is expected when cancelling long-polling
        }
        bot = null
      }
    },
  }

  return {
    id: CHANNEL_ID,
    name: 'Telegram',
    realtime,
  }
}
