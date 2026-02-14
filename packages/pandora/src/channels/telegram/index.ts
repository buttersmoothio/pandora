/**
 * Telegram Channel implementation using grammy
 */

import { Bot, type Context } from "grammy";
import {
  defineChannel,
  logger,
  Gateway,
  type TelegramConfig,
  type Channel,
  type ChannelPusher,
  type ChannelCapabilities,
  type Attachment,
  type Message,
  type MessageHandler,
} from "@pandora/core";
import { markdownToHtml } from "./format";

/**
 * Telegram channel capabilities - hardcoded as they're fixed characteristics
 */
const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
  supportsImages: true,
  supportsFiles: true,
  supportsRichText: true, // Telegram supports Formatting
  supportsButtons: true, // Inline keyboards
  supportsStreaming: false, // Would need message editing
  maxMessageLength: 4096,
  supportsPush: true, // Telegram bots can send unsolicited messages
};

/** Telegram channel: owner-only bot, text/photo/document/voice/audio/video, HTML replies, message splitting. */
export class TelegramChannel implements Channel, ChannelPusher {
  readonly name = "telegram";
  readonly capabilities = TELEGRAM_CAPABILITIES;

  private bot: Bot;
  private ownerId: string;
  private gateway: Gateway;
  private messageHandler: MessageHandler;
  /** Current active conversation ID (single-user, one conversation at a time). */
  private activeConversationId: string | null = null;

  /**
   * @param config - Telegram config (token, ownerId).
   * @param gateway - Gateway for handling messages.
   */
  constructor(config: TelegramConfig, gateway: Gateway) {
    this.bot = new Bot(config.token);
    this.ownerId = config.ownerId;
    this.gateway = gateway;
    this.messageHandler = gateway.getHandler();

    this.setupHandlers();
  }

  /**
   * Get or resume the active conversation ID.
   * On restart, resumes the most recent conversation (cross-channel continuity).
   */
  private async getActiveConversationId(): Promise<string> {
    if (!this.activeConversationId) {
      const conversations = await this.gateway.listConversations();
      const latest = conversations[0];
      if (latest) {
        this.activeConversationId = latest.id;
        logger.channel("telegram", "Resumed conversation", {
          conversationId: this.activeConversationId,
        });
      } else {
        this.activeConversationId = `conv-${Date.now()}`;
        logger.channel("telegram", "Created new conversation", {
          conversationId: this.activeConversationId,
        });
      }
    }
    return this.activeConversationId;
  }

  /** Register Grammy handlers: /start, text, photo, document, voice, audio, video, errors. */
  private setupHandlers(): void {
    // Handle /start command - welcome message and start new conversation
    this.bot.command("start", async (ctx) => {
      const userId = ctx.from?.id.toString();

      if (!userId || userId !== this.ownerId) {
        await ctx.reply("Sorry, this bot is private.");
        return;
      }

      this.activeConversationId = `conv-${Date.now()}`;
      logger.channel("telegram", "Started new conversation via /start", {
        conversationId: this.activeConversationId,
      });

      const greetings = [
        "New conversation started. What's up?",
        "Fresh start. What are we working on?",
        "Clean slate. Go ahead.",
        "Ready. What do you need?",
      ];
      await ctx.reply(greetings[Math.floor(Math.random() * greetings.length)]!);
    });

    // Handle text messages (non-commands)
    this.bot.on("message:text", async (ctx) => {
      await this.handleMessage(ctx, ctx.message.text);
    });

    // Handle photo messages
    this.bot.on("message:photo", async (ctx) => {
      const photo = ctx.msg.photo;
      // Get the largest photo (best quality - last in array)
      const largest = photo[photo.length - 1];

      if (!largest) {
        logger.error("Telegram", "Photo message without photo data");
        return;
      }

      const attachment: Attachment = {
        type: "image",
        fileId: largest.file_id,
        size: largest.file_size,
        caption: ctx.msg.caption,
      };

      const content = ctx.msg.caption || "[Photo received]";
      await this.handleMessage(ctx, content, [attachment]);
    });

    // Handle document messages
    this.bot.on("message:document", async (ctx) => {
      const doc = ctx.msg.document;

      const attachment: Attachment = {
        type: "file",
        fileId: doc.file_id,
        filename: doc.file_name,
        mimeType: doc.mime_type,
        size: doc.file_size,
        caption: ctx.msg.caption,
      };

      const content = ctx.msg.caption || `[Document: ${doc.file_name || "unnamed"}]`;
      await this.handleMessage(ctx, content, [attachment]);
    });

    // Handle voice messages
    this.bot.on("message:voice", async (ctx) => {
      const voice = ctx.msg.voice;

      const attachment: Attachment = {
        type: "audio",
        fileId: voice.file_id,
        mimeType: voice.mime_type,
        size: voice.file_size,
        duration: voice.duration,
      };

      const content = `[Voice message: ${voice.duration}s]`;
      await this.handleMessage(ctx, content, [attachment]);
    });

    // Handle audio messages (music files)
    this.bot.on("message:audio", async (ctx) => {
      const audio = ctx.msg.audio;

      const attachment: Attachment = {
        type: "audio",
        fileId: audio.file_id,
        filename: audio.file_name,
        mimeType: audio.mime_type,
        size: audio.file_size,
        duration: audio.duration,
        caption: ctx.msg.caption,
      };

      const content = ctx.msg.caption || `[Audio: ${audio.title || audio.file_name || "unnamed"}]`;
      await this.handleMessage(ctx, content, [attachment]);
    });

    // Handle video messages
    this.bot.on("message:video", async (ctx) => {
      const video = ctx.msg.video;

      const attachment: Attachment = {
        type: "video",
        fileId: video.file_id,
        filename: video.file_name,
        mimeType: video.mime_type,
        size: video.file_size,
        duration: video.duration,
        caption: ctx.msg.caption,
      };

      const content = ctx.msg.caption || `[Video: ${video.duration}s]`;
      await this.handleMessage(ctx, content, [attachment]);
    });

    // Handle errors
    this.bot.catch((err) => {
      logger.error("Telegram", "Bot error", err);
    });
  }

  /** Validate owner, build Message, call gateway handler, send reply. */
  private async handleMessage(
    ctx: Context,
    content: string,
    attachments?: Attachment[]
  ): Promise<void> {
    const userId = ctx.from?.id.toString();
    const chatId = ctx.chat?.id.toString();
    const messageId = ctx.msg?.message_id;

    // Security check: only respond to owner
    if (!userId || !chatId || userId !== this.ownerId) {
      logger.channel("telegram", "Ignored non-owner message", { userId });
      return;
    }

    // Get active conversation (may resume from restart or cross-channel)
    const conversationId = await this.getActiveConversationId();

    // Create a Message object for the gateway
    const message: Message = {
      channelName: this.name,
      userId,
      conversationId,
      content,
      attachments,
      replyToMessageId: messageId,
      metadata: {
        messageId,
        chatId,
        chatType: ctx.chat?.type,
      },
    };

    try {
      // Show typing indicator while processing
      await ctx.replyWithChatAction("typing");

      // Process through gateway
      const response = await this.messageHandler(message, this.capabilities);

      // Send response with Markdown and reply-to
      await this.sendResponse(ctx, response, messageId);
    } catch (error) {
      logger.error("Telegram", "Error processing message", error);
      await ctx.reply("Sorry, I encountered an error processing your message.");
    }
  }

  /** Convert markdown to HTML, split at max length, send with reply-to on the first chunk. */
  private async sendResponse(
    ctx: Context,
    response: string,
    replyToMessageId?: number
  ): Promise<void> {
    const html = markdownToHtml(response);
    const maxLength = this.capabilities.maxMessageLength;
    const chunks = this.splitMessage(html, maxLength);

    // First chunk quotes the original message
    let isFirst = true;
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, {
          parse_mode: "HTML",
          ...(isFirst && replyToMessageId
            ? { reply_parameters: { message_id: replyToMessageId } }
            : {}),
        });
      } catch (error) {
        // Fallback to plain text if HTML parsing fails
        logger.channel("telegram", "HTML parse failed, using plain text", { 
          error: error instanceof Error ? error.message : String(error) 
        });
        await ctx.reply(chunk, {
          ...(isFirst && replyToMessageId
            ? { reply_parameters: { message_id: replyToMessageId } }
            : {}),
        });
      }
      isFirst = false;
    }
  }

  /** Split text at newline/space boundaries, each chunk ≤ maxLength. */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (newline or space)
      let splitAt = remaining.lastIndexOf("\n", maxLength);
      if (splitAt === -1 || splitAt < maxLength / 2) {
        splitAt = remaining.lastIndexOf(" ", maxLength);
      }
      if (splitAt === -1 || splitAt < maxLength / 2) {
        splitAt = maxLength;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }

  /** Connect to Telegram, set commands, start polling. */
  async start(): Promise<void> {
    logger.channel("telegram", "Starting bot");

    // Get bot info to verify token
    const botInfo = await this.bot.api.getMe();
    logger.channel("telegram", "Bot connected", { username: `@${botInfo.username}` });

    // Register bot commands with Telegram
    await this.bot.api.setMyCommands([
      { command: "start", description: "Start a new conversation" },
    ]);

    // Start polling
    this.bot.start();
  }

  /** Stop polling and clean up. */
  async stop(): Promise<void> {
    logger.channel("telegram", "Stopping bot");
    await this.bot.stop();
  }

  /**
   * Push a proactive message to the user.
   * Used for scheduled reminders and notifications.
   *
   * @param userId - User ID (Telegram chat ID)
   * @param content - Message content (Markdown)
   */
  async push(userId: string, content: string): Promise<void> {
    const chatId = parseInt(userId, 10);
    const html = markdownToHtml(content);
    const chunks = this.splitMessage(html, this.capabilities.maxMessageLength);

    logger.channel("telegram", "Pushing message", { userId, chunks: chunks.length });

    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: "HTML" });
      } catch (error) {
        // Fallback to plain text if HTML parsing fails
        logger.channel("telegram", "HTML parse failed, using plain text", {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
  }
}

// Self-register the channel
export default defineChannel({
  name: "telegram",
  configKey: "telegram",
  create: (config, gateway) => new TelegramChannel(config as TelegramConfig, gateway),
});
