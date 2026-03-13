import type {
  Channel,
  ChannelGateway,
  ChannelRealtime,
  GenerateResult,
  MessagePart,
} from '@pandorakit/sdk/channels'
import type { Context } from 'grammy'
import { Bot, GrammyError, HttpError, InlineKeyboard } from 'grammy'
import { markdownToHtml } from './format'
import { splitMessage } from './telegram-api'

const CHANNEL_ID = 'telegram'

const NEW_THREAD_GREETINGS: string[] = [
  'New conversation started. What\u2019s up?',
  'Fresh start. What are we working on?',
  'Clean slate. Go ahead.',
  'Ready. What do you need?',
]

function randomGreeting(): string {
  return NEW_THREAD_GREETINGS[Math.floor(Math.random() * NEW_THREAD_GREETINGS.length)] ?? 'Hello!'
}

/**
 * Send a reply via grammY, splitting long messages and falling back
 * to plain text if HTML parsing fails.
 */
async function reply(ctx: Context, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML' })
    } catch (_htmlErr) {
      // HTML parse failed — fall back to plain text
      await ctx.reply(chunk)
    }
  }
}

/** Format tool args as a readable key-value list */
function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return ''
  }
  const entries = Object.entries(args)
  if (entries.length === 0) {
    return ''
  }
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

export function createTelegramAdapter(token: string, ownerId: string): Channel {
  let bot: Bot | null = null

  // Store pending approvals — Telegram callback data has 64-byte limit, so we
  // use short IDs and look up the full runId/toolCallId from this map.
  let approvalCounter = 0
  const pendingApprovals = new Map<string, { runId: string; toolCallId: string }>()

  const realtime: ChannelRealtime = {
    async start(runtime: ChannelGateway): Promise<void> {
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

      /** Download a Telegram file and return it as a file part. */
      async function downloadFile(
        ctx: Context,
        fileId: string,
        mimeType: string,
        filename?: string,
      ): Promise<MessagePart | null> {
        try {
          const file = await ctx.api.getFile(fileId)
          if (!file.file_path) {
            return null
          }
          const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`
          const res = await fetch(url)
          if (!res.ok) {
            return null
          }
          const buffer = new Uint8Array(await res.arrayBuffer())
          return { type: 'file', data: buffer, mimeType, filename }
        } catch (err) {
          runtime.logger.warn('[telegram] file download failed', {
            fileId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
          return null
        }
      }

      /** Extract a photo part from the message, if present. */
      async function extractPhoto(ctx: Context): Promise<MessagePart | null> {
        const photo = ctx.message?.photo
        if (!photo || photo.length === 0) {
          return null
        }
        const largest = photo[photo.length - 1]
        return downloadFile(ctx, largest.file_id, 'image/jpeg')
      }

      /** Extract a document part from the message, if present. */
      async function extractDocument(ctx: Context): Promise<MessagePart | null> {
        const doc = ctx.message?.document
        if (!doc) {
          return null
        }
        return downloadFile(
          ctx,
          doc.file_id,
          doc.mime_type ?? 'application/octet-stream',
          doc.file_name,
        )
      }

      /** Build parts from a message that may contain text + files. */
      async function extractParts(ctx: Context): Promise<MessagePart[]> {
        const parts: MessagePart[] = []

        const photoPart = await extractPhoto(ctx)
        if (photoPart) {
          parts.push(photoPart)
        }

        const docPart = await extractDocument(ctx)
        if (docPart) {
          parts.push(docPart)
        }

        const text = ctx.message?.text?.trim() ?? ctx.message?.caption?.trim()
        if (text) {
          parts.push({ type: 'text', text })
        }

        return parts
      }

      /** Handle any user message (text, photo, document). */
      async function handleMessage(ctx: Context): Promise<void> {
        const parts = await extractParts(ctx)
        if (parts.length === 0) {
          return
        }

        const chatId = String(ctx.chat?.id)
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
            parts,
          })
          await sendResult(ctx, result, pendingApprovals, nextId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Something went wrong.'
          runtime.logger.error('[telegram] message handling failed', { error: message })
          await reply(ctx, message)
        } finally {
          clearInterval(typingInterval)
        }
      }

      bot.on('message:text', handleMessage)
      bot.on('message:photo', handleMessage)
      bot.on('message:document', handleMessage)

      /** Resolve a tool approval callback (approve or deny). */
      async function handleApproval(
        ctx: Context,
        action: string,
        pending: { runId: string; toolCallId: string },
      ): Promise<void> {
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
      }

      bot.callbackQuery(/^(a|d):(\d+)$/, async (ctx) => {
        const match = ctx.match
        if (!match || typeof match === 'string') {
          return
        }
        const [, action, id] = match
        const pending = pendingApprovals.get(id)
        if (!pending) {
          await ctx.answerCallbackQuery('Approval expired')
          return
        }
        pendingApprovals.delete(id)

        try {
          await handleApproval(ctx, action, pending)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Something went wrong.'
          runtime.logger.error('[telegram] tool approval failed', { error: message })
          await reply(ctx, message)
        }
      })

      bot.catch((err) => {
        const e = err.error
        if (e instanceof GrammyError) {
          runtime.logger.error('[telegram] API error', { error: e.description })
        } else if (e instanceof HttpError) {
          runtime.logger.error('[telegram] network error', { error: e.message })
        } else {
          runtime.logger.error('[telegram] unexpected error', { error: e })
        }
      })

      // Start long-polling (non-blocking)
      bot.start()
    },

    async stop(): Promise<void> {
      if (bot) {
        try {
          await bot.stop()
        } catch (_stopErr) {
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
    async notify(message: { subject: string; body: string }): Promise<void> {
      if (!bot) {
        throw new Error('Telegram bot not started — cannot send notification')
      }
      const text = `<b>${markdownToHtml(message.subject)}</b>\n\n${markdownToHtml(message.body)}`
      for (const chunk of splitMessage(text)) {
        try {
          await bot.api.sendMessage(Number(ownerId), chunk, { parse_mode: 'HTML' })
        } catch (_htmlErr) {
          // HTML parse failed — fall back to plain text
          await bot.api.sendMessage(Number(ownerId), chunk)
        }
      }
    },
  }
}
