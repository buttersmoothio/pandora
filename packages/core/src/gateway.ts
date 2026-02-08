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
  GatewayEvent,
} from "./types";
import { logger } from "./logger";

type GatewayListener = (event: GatewayEvent) => void;

/** Central hub: receives messages from channels, stores them, calls the agent, stores and returns the response. */
export class Gateway {
  private listeners = new Map<string, Set<GatewayListener>>();

  /**
   * @param store - Message store for conversation history.
   * @param agent - AI agent for generating responses.
   */
  constructor(
    private store: IMessageStore,
    private agent: Agent
  ) {}

  /** Subscribe to events for a conversation. Returns unsubscribe function. */
  subscribe(conversationId: string, listener: GatewayListener): () => void {
    let set = this.listeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.listeners.set(conversationId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(conversationId);
    };
  }

  /** Emit an event to all subscribers of a conversation. */
  private emit(conversationId: string, event: GatewayEvent): void {
    const set = this.listeners.get(conversationId);
    if (!set) return;
    for (const listener of set) {
      listener(event);
    }
  }

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
    // Delegate to streaming path — it handles store, logging, and event emission
    const stream = this.handleMessageStream(message, capabilities);

    let fullText = "";
    while (true) {
      const { value, done } = await stream.next();
      if (done) break;
      fullText += value;
    }

    return fullText;
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

    // Emit user-message for subscribers (e.g. other web tabs watching this conversation)
    this.emit(conversationId, { type: "user-message", conversationId, channelName, content });

    await this.store.addMessage(
      conversationId,
      { role: "user", content },
      { channelName, userId }
    );

    const history = await this.store.getHistory(conversationId);

    const stream = this.agent.chatStream(history, capabilities, (event) => {
      onEvent?.(event);
      this.emit(conversationId, { ...event, conversationId });
    });

    let fullText = "";
    while (true) {
      const { value, done } = await stream.next();
      if (done) {
        fullText = value; // Return value of the generator is the full text
        break;
      }
      this.emit(conversationId, { type: "delta", conversationId, text: value });
      yield value;
    }

    await this.store.addMessage(conversationId, {
      role: "assistant",
      content: fullText,
    });

    this.emit(conversationId, { type: "done", conversationId });

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
