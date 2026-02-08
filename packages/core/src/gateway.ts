/**
 * Gateway - Central message routing hub
 *
 * Orchestrates the flow between channels, message store, and AI agent.
 * - Receives messages from channels
 * - Stores them in MessageStore
 * - Passes to Agent with history
 * - Stores response and returns it
 */

import type { Agent } from "./agent";
import type { IMessageStore, ConversationInfo } from "./registries/store";
import type {
  Message,
  ChatMessage,
  ChannelCapabilities,
  MessageHandler,
  StreamEvent,
} from "./types";
import { logger } from "./logger";

/** Central hub: receives messages from channels, stores them, calls the agent, stores and returns the response. */
export class Gateway {
  /**
   * @param store - Message store for conversation history.
   * @param agent - AI agent for generating responses.
   */
  constructor(
    private store: IMessageStore,
    private agent: Agent
  ) {}

  /**
   * Handle an incoming message: store user message, load history, generate reply, store reply.
   *
   * @param message - Incoming message from a channel.
   * @param capabilities - Channel capabilities (passed to the agent).
   * @returns The generated reply text.
   */
  async handleMessage(
    message: Message,
    capabilities: ChannelCapabilities
  ): Promise<string> {
    const { channelName, conversationId, userId, content } = message;
    const startTime = Date.now();

    logger.messageReceived(channelName, conversationId, userId);

    // Store the incoming user message
    await this.store.addMessage(
      conversationId,
      { role: "user", content },
      { channelName, userId }
    );

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
   * Get a message handler for channels. Channels call this with (message, capabilities).
   *
   * @returns Handler that processes messages through this gateway.
   */
  getHandler(): MessageHandler {
    return (message, capabilities) =>
      this.handleMessage(message, capabilities);
  }

  /**
   * Handle an incoming message with streaming: store user message, load history,
   * stream reply deltas, store the complete reply.
   *
   * @param message - Incoming message from a channel.
   * @param capabilities - Channel capabilities (passed to the agent).
   * @param onEvent - Optional callback for stream events (tool calls, etc.).
   * @yields Text deltas as they stream in.
   */
  async *handleMessageStream(
    message: Message,
    capabilities: ChannelCapabilities,
    onEvent?: (event: StreamEvent) => void
  ): AsyncGenerator<string, void> {
    const { channelName, conversationId, userId, content } = message;
    const startTime = Date.now();

    logger.messageReceived(channelName, conversationId, userId);

    await this.store.addMessage(
      conversationId,
      { role: "user", content },
      { channelName, userId }
    );

    const history = await this.store.getHistory(conversationId);

    const stream = this.agent.chatStream(history, capabilities, onEvent);

    let fullText = "";
    while (true) {
      const { value, done } = await stream.next();
      if (done) {
        fullText = value; // Return value of the generator is the full text
        break;
      }
      yield value;
    }

    await this.store.addMessage(conversationId, {
      role: "assistant",
      content: fullText,
    });

    const durationMs = Date.now() - startTime;
    logger.messageSent(channelName, conversationId, fullText.length, durationMs);
  }

  /**
   * Get a streaming message handler for channels that support streaming.
   *
   * @returns Streaming handler that yields text deltas.
   */
  getStreamingHandler(): (
    message: Message,
    capabilities: ChannelCapabilities
  ) => AsyncGenerator<string, void> {
    return (message, capabilities) =>
      this.handleMessageStream(message, capabilities);
  }

  /**
   * Get a streaming handler that also supports stream events (tool calls, etc.).
   *
   * @returns Streaming handler that accepts an onEvent callback.
   */
  getStreamingHandlerWithEvents(): (
    message: Message,
    capabilities: ChannelCapabilities,
    onEvent?: (event: StreamEvent) => void
  ) => AsyncGenerator<string, void> {
    return (message, capabilities, onEvent) =>
      this.handleMessageStream(message, capabilities, onEvent);
  }

  /**
   * Clear all messages for a conversation (e.g. when user sends /start).
   *
   * @param conversationId - Conversation/chat ID to clear.
   */
  async clearConversation(conversationId: string): Promise<void> {
    await this.store.clearHistory(conversationId);
  }

  /** List conversations, optionally filtered by channel name. */
  async listConversations(channelName?: string): Promise<ConversationInfo[]> {
    return this.store.listConversations(channelName);
  }

  /** Delete a conversation and all its messages. */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.store.deleteConversation(conversationId);
  }

  /** Get conversation history for a specific conversation. */
  async getConversationHistory(
    conversationId: string
  ): Promise<ChatMessage[]> {
    return this.store.getHistory(conversationId);
  }
}
