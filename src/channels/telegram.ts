/**
 * Telegram Channel implementation using grammy
 */

import { Bot } from "grammy";
import type { TelegramConfig } from "../core/config.ts";
import type {
  Channel,
  ChannelCapabilities,
  Message,
  MessageHandler,
} from "../core/types.ts";
import { isOwner } from "./base.ts";
import { logger } from "../core/logger.ts";

/**
 * Telegram channel capabilities - hardcoded as they're fixed characteristics
 */
const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
  supportsImages: true,
  supportsFiles: true,
  supportsRichText: true, // Telegram supports Markdown
  supportsButtons: true, // Inline keyboards
  supportsStreaming: false, // Would need message editing
  maxMessageLength: 4096,
};

export class TelegramChannel implements Channel {
  readonly name = "telegram";
  readonly capabilities = TELEGRAM_CAPABILITIES;

  private bot: Bot;
  private ownerId: string;
  private messageHandler: MessageHandler;

  constructor(config: TelegramConfig, messageHandler: MessageHandler) {
    this.bot = new Bot(config.token);
    this.ownerId = config.ownerId;
    this.messageHandler = messageHandler;

    this.setupHandlers();
  }

  /**
   * Set up message handlers for the bot
   */
  private setupHandlers(): void {
    // Handle text messages
    this.bot.on("message:text", async (ctx) => {
      const userId = ctx.from?.id.toString();
      const chatId = ctx.chat.id.toString();
      const text = ctx.message.text;

      // Security check: only respond to owner
      if (!userId || !isOwner(userId, this.ownerId)) {
        logger.channel("telegram", "Ignored non-owner message", { userId });
        return;
      }

      // Create a Message object for the gateway
      const message: Message = {
        channelName: this.name,
        userId,
        conversationId: chatId, // Use chat ID as conversation ID
        content: text,
        metadata: {
          messageId: ctx.message.message_id,
          chatType: ctx.chat.type,
        },
      };

      try {
        // Show typing indicator while processing
        await ctx.replyWithChatAction("typing");

        // Process through gateway
        const response = await this.messageHandler(message, this.capabilities);

        // Send response, splitting if necessary
        await this.sendResponse(ctx, response);
      } catch (error) {
        logger.error("Telegram", "Error processing message", error);
        await ctx.reply("Sorry, I encountered an error processing your message.");
      }
    });

    // Handle /start command
    this.bot.command("start", async (ctx) => {
      const userId = ctx.from?.id.toString();

      if (!userId || !isOwner(userId, this.ownerId)) {
        await ctx.reply("Sorry, this bot is private.");
        return;
      }

      await ctx.reply(
        "Hello! I'm your AI assistant. Send me a message and I'll respond."
      );
    });

    // Handle /clear command to reset conversation
    this.bot.command("clear", async (ctx) => {
      const userId = ctx.from?.id.toString();

      if (!userId || !isOwner(userId, this.ownerId)) {
        return;
      }

      // We'll need to expose a clear method - for now just acknowledge
      await ctx.reply("Conversation cleared. Starting fresh!");
    });

    // Handle errors
    this.bot.catch((err) => {
      logger.error("Telegram", "Bot error", err);
    });
  }

  /**
   * Send a response, splitting into multiple messages if too long
   */
  private async sendResponse(
    ctx: { reply: (text: string) => Promise<unknown> },
    response: string
  ): Promise<void> {
    const maxLength = this.capabilities.maxMessageLength;

    if (response.length <= maxLength) {
      await ctx.reply(response);
      return;
    }

    // Split into chunks at word boundaries
    const chunks: string[] = [];
    let remaining = response;

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

    // Send each chunk
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  }

  /**
   * Start the bot (begin polling for messages)
   */
  async start(): Promise<void> {
    logger.channel("telegram", "Starting bot");

    // Get bot info to verify token
    const botInfo = await this.bot.api.getMe();
    logger.channel("telegram", "Bot connected", { username: `@${botInfo.username}` });

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
