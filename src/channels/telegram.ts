/**
 * Telegram Channel implementation using grammy
 */

import { Bot, type Context } from "grammy";
import type { TelegramConfig } from "../core/config";
import type { Gateway } from "../core/gateway";
import type {
  Attachment,
  Channel,
  ChannelCapabilities,
  Message,
  MessageHandler,
} from "../core/types";
import { isOwner } from "./base";
import { logger } from "../core/logger";

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
};

export class TelegramChannel implements Channel {
  readonly name = "telegram";
  readonly capabilities = TELEGRAM_CAPABILITIES;

  private bot: Bot;
  private ownerId: string;
  private gateway: Gateway;
  private messageHandler: MessageHandler;

  constructor(config: TelegramConfig, gateway: Gateway) {
    this.bot = new Bot(config.token);
    this.ownerId = config.ownerId;
    this.gateway = gateway;
    this.messageHandler = gateway.getHandler();

    this.setupHandlers();
  }

  /**
   * Set up message handlers for the bot
   */
  private setupHandlers(): void {
    // Handle /start command (must be before text handler)
    this.bot.command("start", async (ctx) => {
      const userId = ctx.from?.id.toString();
      const chatId = ctx.chat?.id.toString();

      if (!userId || !chatId || !isOwner(userId, this.ownerId)) {
        await ctx.reply("Sorry, this bot is private.");
        return;
      }

      // Clear conversation history
      await this.gateway.clearConversation(chatId);
      logger.channel("telegram", "Conversation cleared via /start", { chatId });

      await ctx.reply(
        "Hello! I'm <i>Pandora</i>, your AI assistant. Send me a message and I'll respond.",
        { parse_mode: "HTML" }
      );
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

  /**
   * Common handler for all message types
   */
  private async handleMessage(
    ctx: Context,
    content: string,
    attachments?: Attachment[]
  ): Promise<void> {
    const userId = ctx.from?.id.toString();
    const chatId = ctx.chat?.id.toString();
    const messageId = ctx.msg?.message_id;

    // Security check: only respond to owner
    if (!userId || !chatId || !isOwner(userId, this.ownerId)) {
      logger.channel("telegram", "Ignored non-owner message", { userId });
      return;
    }

    // Create a Message object for the gateway
    const message: Message = {
      channelName: this.name,
      userId,
      conversationId: chatId,
      content,
      attachments,
      replyToMessageId: messageId,
      metadata: {
        messageId,
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

  /**
   * Send a response, splitting into multiple messages if too long.
   * Uses HTML formatting and quotes the original message.
   */
  private async sendResponse(
    ctx: Context,
    response: string,
    replyToMessageId?: number
  ): Promise<void> {
    const maxLength = this.capabilities.maxMessageLength;
    const chunks = this.splitMessage(response, maxLength);

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

  /**
   * Split a message into chunks at word/line boundaries
   */
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

  /**
   * Start the bot (begin polling for messages)
   */
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

  /**
   * Stop the bot gracefully
   */
  async stop(): Promise<void> {
    logger.channel("telegram", "Stopping bot");
    await this.bot.stop();
  }
}
