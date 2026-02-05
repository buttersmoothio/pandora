/**
 * Gateway - Central message routing hub
 *
 * Orchestrates the flow between channels, message store, and AI agent.
 * - Receives messages from channels
 * - Stores them in MessageStore
 * - Passes to Agent with history
 * - Stores response and returns it
 */

import type { Agent } from "./agent.ts";
import type { IMessageStore } from "./message-store.ts";
import type { Message, ChannelCapabilities, MessageHandler } from "./types.ts";
import { logger } from "./logger.ts";

export class Gateway {
  constructor(
    private store: IMessageStore,
    private agent: Agent
  ) {}

  /**
   * Handle an incoming message from a channel.
   * Stores the message, gets history, generates response, stores response.
   */
  async handleMessage(
    message: Message,
    capabilities: ChannelCapabilities
  ): Promise<string> {
    const { channelName, conversationId, userId, content } = message;
    const startTime = Date.now();

    logger.messageReceived(channelName, conversationId, userId);

    // Store the incoming user message
    await this.store.addMessage(conversationId, {
      role: "user",
      content,
    });

    // Get full conversation history
    const history = await this.store.getHistory(conversationId);

    // Generate AI response
    const response = await this.agent.chat(history, capabilities);

    // Store the assistant's response
    await this.store.addMessage(conversationId, {
      role: "assistant",
      content: response,
    });

    const durationMs = Date.now() - startTime;
    logger.messageSent(channelName, conversationId, response.length, durationMs);

    return response;
  }

  /**
   * Get a message handler function that can be passed to channels.
   * This creates a closure over the gateway instance.
   */
  getHandler(): MessageHandler {
    return (message, capabilities) =>
      this.handleMessage(message, capabilities);
  }

  /**
   * Clear conversation history for a specific conversation
   */
  async clearConversation(conversationId: string): Promise<void> {
    await this.store.clearHistory(conversationId);
  }
}
