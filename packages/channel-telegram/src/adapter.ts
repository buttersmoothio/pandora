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

/** Send the result to the chat — either an approval keyboard or text reply. */
async function sendResult(ctx: Context, result: GenerateResult): Promise<void> {
  if (result.pendingToolApproval) {
    const { toolCallId, toolName, args } = result.pendingToolApproval
    const keyboard = new InlineKeyboard()
      .text('Approve', `approve:${result.runId}:${toolCallId}`)
      .text('Deny', `deny:${result.runId}:${toolCallId}`)

    const argsText = JSON.stringify(args, null, 2)
    await ctx.reply(`<b>${toolName}</b> wants to run:\n<pre>${argsText}</pre>`, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
  } else if (result.text) {
    await reply(ctx, markdownToHtml(result.text))
  }
}

export function createTelegramAdapter(token: string, ownerId: string): ChannelAdapter {
  let bot: Bot | null = null

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

        const chatId = ctx.chat.id
        const threadId = await runtime.resolveThread(CHANNEL_ID, String(chatId))

        await ctx.replyWithChatAction('typing')
        const typingInterval = setInterval(
          () => ctx.replyWithChatAction('typing').catch(() => {}),
          5_000,
        )

        try {
          const result = await runtime.generate({
            threadId,
            parts: [{ type: 'text', text }],
          })
          await sendResult(ctx, result)
        } finally {
          clearInterval(typingInterval)
        }
      })

      bot.callbackQuery(/^(approve|deny):(.+):(.+)$/, async (ctx) => {
        const match = ctx.match as RegExpMatchArray
        const [, action, runId, toolCallId] = match
        await ctx.answerCallbackQuery(action === 'approve' ? 'Approved' : 'Denied')
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })

        await ctx.replyWithChatAction('typing')
        const result =
          action === 'approve'
            ? await runtime.approveToolCall({ runId, toolCallId })
            : await runtime.declineToolCall({ runId, toolCallId })

        await sendResult(ctx, result)
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
        await bot.stop()
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
