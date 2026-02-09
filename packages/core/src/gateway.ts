/**
 * Gateway - Central message routing hub
 *
 * Orchestrates the flow between channels, message store, and AI agent.
 * - Receives messages from channels
 * - Stores them in MessageStore (incrementally during streaming)
 * - Passes to Agent with history
 * - Parts are persisted as they stream in
 */

import type { Agent } from "./agent";
import type { IMessageStore, ConversationInfo, SubagentContext } from "./registries";
import type {
  Message,
  ChannelCapabilities,
  MessageHandler,
  StreamEvent,
  GatewayEvent,
  UIMessage,
  TextUIPart,
  DynamicToolUIPart,
  ReasoningUIPart,
  FileUIPart,
  MessageMeta,
} from "./types";
import { logger } from "./logger";

/** Per-thread state for parallel thread support */
interface ThreadContext {
  threadId: string;
  assistantMessageId: string;
  fullText: string;
  hasStartedTextPart: boolean;
  accumulatedReasoning: string;
}

type GatewayListener = (event: GatewayEvent) => void;

/** State of an active stream for late-joining subscribers. */
export interface ActiveStreamState {
  conversationId: string;
  channelName: string;
  userContent: string;
  partialText: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown; result?: unknown }>;
  sources: Array<{ sourceType: string; id: string; url?: string; title?: string }>;
  reasoning: string;
}

/** Central hub: receives messages from channels, stores them, calls the agent, stores and returns the response. */
export class Gateway {
  private listeners = new Map<string, Set<GatewayListener>>();
  private globalListeners = new Set<GatewayListener>();
  private activeStreams = new Map<string, ActiveStreamState>();
  /** Per-conversation locks to serialize message processing. */
  private conversationLocks = new Map<string, Promise<void>>();

  /**
   * @param store - Message store for conversation history.
   * @param agent - AI agent for generating responses.
   */
  constructor(
    private store: IMessageStore,
    private agent: Agent
  ) { }

  /**
   * Acquire a lock for a conversation. Ensures only one message is processed at a time per conversation.
   * @returns Release function to call when done.
   */
  private async acquireConversationLock(conversationId: string): Promise<() => void> {
    const existing = this.conversationLocks.get(conversationId);

    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.conversationLocks.set(conversationId, lock);

    // Wait for any existing lock to release
    if (existing) {
      await existing;
    }

    return () => {
      release();
      // Clean up if this is still the current lock
      if (this.conversationLocks.get(conversationId) === lock) {
        this.conversationLocks.delete(conversationId);
      }
    };
  }

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

  /** Subscribe to events for all conversations. Returns unsubscribe function. */
  subscribeAll(listener: GatewayListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /** Emit an event to all subscribers of a conversation and global subscribers. */
  private emit(conversationId: string, event: GatewayEvent): void {
    const set = this.listeners.get(conversationId);
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
    for (const listener of this.globalListeners) {
      listener(event);
    }
  }

  /** Get active stream state for a conversation (for late-joining subscribers). */
  getActiveStreamState(conversationId: string): ActiveStreamState | undefined {
    return this.activeStreams.get(conversationId);
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
   * stream reply deltas, store parts incrementally as they arrive.
   *
   * Centralizes ALL persistence (operator + subagent threads) in one place.
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

    // Acquire per-conversation lock to prevent interleaved processing
    const releaseLock = await this.acquireConversationLock(conversationId);

    try {
      const startTime = Date.now();
      const meta: MessageMeta = { channelName, userId };

      logger.messageReceived(channelName, conversationId, userId);

      // Initialize active stream state for late-joining subscribers
      const streamState: ActiveStreamState = {
        conversationId,
        channelName,
        userContent: content,
        partialText: "",
        toolCalls: [],
        sources: [],
        reasoning: "",
      };
      this.activeStreams.set(conversationId, streamState);

      // Emit user-message for subscribers (e.g. other web tabs watching this conversation)
      this.emit(conversationId, { type: "user-message", conversationId, channelName, content });

      // Create user message with text part
      const userMessageId = await this.store.createMessage(conversationId, "user", meta);
      await this.store.appendPart(userMessageId, {
        type: "text",
        text: content,
        state: "done",
      } as TextUIPart);

      // Load history for agent
      const history = await this.store.getHistory(conversationId);

      // Create assistant message shell before streaming
      const assistantMessageId = await this.store.createMessage(conversationId, "assistant", meta);

      // Operator context state (for main conversation)
      const operatorCtx = {
        fullText: "",
        hasStartedTextPart: false,
        accumulatedReasoning: "",
      };

      // Track all active threads (supports parallel subagent execution)
      const threadContexts = new Map<string, ThreadContext>();

      // Create subagent context - gateway owns all setup and persistence
      const subagentCtx: SubagentContext = {
        parentConversationId: conversationId,
        meta,

        // Gateway handles all thread setup
        createThread: async (toolCallId: string, subagentName: string, prompt: string) => {
          // Create child conversation for this subagent thread
          const threadId = await this.store.createSubagentConversation(
            conversationId,
            toolCallId,
            subagentName,
            meta
          );

          // Create user message in child thread with the delegated task
          const userMsgId = await this.store.createMessage(threadId, "user", meta);
          await this.store.appendPart(userMsgId, {
            type: "text",
            text: prompt,
            state: "done",
          } as TextUIPart);

          // Create assistant message shell
          const asstMsgId = await this.store.createMessage(threadId, "assistant", meta);

          // Track for persistence routing (parallel-safe: each thread has own entry)
          threadContexts.set(threadId, {
            threadId,
            assistantMessageId: asstMsgId,
            fullText: "",
            hasStartedTextPart: false,
            accumulatedReasoning: "",
          });

          // Emit subagent-start to subscribers
          const startEvent: StreamEvent = {
            type: "subagent-start",
            threadId,
            toolCallId,
            subagentName,
          };
          onEvent?.(startEvent);
          this.emit(conversationId, { ...startEvent, conversationId });

          return { threadId };
        },

        // Events forwarded to main handler for persistence
        onEvent: async (event) => {
          await handleStreamEvent(event);
        },
      };

      // Unified event handler for both operator and subagent events
      const handleStreamEvent = async (event: StreamEvent) => {
        // Route to correct context based on threadId
        // NOTE: tool-call and tool-result are ALWAYS for the operator's message
        // The threadId on tool-result is metadata (which subagent produced it), not routing
        const isToolEvent = event.type === "tool-call" || event.type === "tool-result";
        const isThread = !isToolEvent && "threadId" in event && !!event.threadId;
        const threadCtx = isThread ? threadContexts.get(event.threadId!) : null;

        // Determine target message and context
        const targetMessageId = isThread
          ? threadCtx?.assistantMessageId
          : assistantMessageId;

        // Handle subagent-done specially - it finalizes the thread
        if (event.type === "subagent-done") {
          const ctx = threadContexts.get(event.threadId);
          if (ctx) {
            // Save any remaining reasoning
            if (ctx.accumulatedReasoning) {
              await this.store.appendPart(ctx.assistantMessageId, {
                type: "reasoning",
                text: ctx.accumulatedReasoning,
                state: "done",
              } as ReasoningUIPart);
            }
            // Finalize the thread's assistant message
            await this.store.finalizeMessage(ctx.assistantMessageId);
            // Clean up
            threadContexts.delete(event.threadId);
          }
          onEvent?.(event);
          this.emit(conversationId, { ...event, conversationId });
          return;
        }

        // Skip events we can't route (e.g. subagent events for unknown threads)
        if (!targetMessageId) {
          onEvent?.(event);
          this.emit(conversationId, { ...event, conversationId });
          return;
        }

        // Get the context to update (operator or thread)
        const ctx = isThread ? threadCtx! : operatorCtx;

        // Unified persistence logic (works for BOTH operator and subagent threads)
        switch (event.type) {
          case "text-delta": {
            if (!ctx.hasStartedTextPart) {
              await this.store.appendPart(targetMessageId, {
                type: "text",
                text: event.text,
                state: "streaming",
              } as TextUIPart);
              ctx.hasStartedTextPart = true;
              ctx.fullText = event.text;
            } else {
              ctx.fullText += event.text;
              await this.store.updateTextPart(targetMessageId, ctx.fullText);
            }
            break;
          }

          case "tool-call": {
            const toolPart: DynamicToolUIPart = {
              type: "dynamic-tool",
              toolName: event.toolName,
              toolCallId: event.toolCallId,
              state: "input-available",
              input: event.args,
            };
            await this.store.appendPart(targetMessageId, toolPart);

            // Track for late-joiners (operator only)
            if (!isThread) {
              streamState.toolCalls.push({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                args: event.args,
              });
            }
            break;
          }

          case "tool-result": {
            await this.store.updateToolResult(targetMessageId, event.toolCallId, event.result);

            // If this is a subagent result with a threadId, link the tool to the thread
            if (event.threadId) {
              await this.store.linkToolToThread(assistantMessageId, event.toolCallId, event.threadId);
            }

            // Track for late-joiners (operator only)
            if (!isThread) {
              const tc = streamState.toolCalls.find((t) => t.toolCallId === event.toolCallId);
              if (tc) tc.result = event.result;
            }
            break;
          }

          case "reasoning-delta": {
            ctx.accumulatedReasoning += event.text ?? "";
            // Track for late-joiners (operator only)
            if (!isThread) {
              streamState.reasoning += event.text ?? "";
            }
            break;
          }

          case "step-start": {
            await this.store.appendPart(targetMessageId, { type: "step-start" });
            break;
          }

          case "step-finish": {
            // Save accumulated reasoning if any
            if (ctx.accumulatedReasoning) {
              await this.store.appendPart(targetMessageId, {
                type: "reasoning",
                text: ctx.accumulatedReasoning,
                state: "done",
              } as ReasoningUIPart);
              ctx.accumulatedReasoning = "";
            }
            // Reset operator stream state reasoning (for late-joiners)
            if (!isThread) {
              streamState.reasoning = "";
            }
            break;
          }

          case "source-url": {
            await this.store.appendPart(targetMessageId, {
              type: "source-url",
              sourceId: event.sourceId,
              url: event.url,
              title: event.title,
            });
            // Track for late-joiners (operator only)
            if (!isThread) {
              streamState.sources.push({
                sourceType: "url",
                id: event.sourceId,
                url: event.url,
                title: event.title,
              });
            }
            break;
          }

          case "source-document": {
            await this.store.appendPart(targetMessageId, {
              type: "source-document",
              sourceId: event.sourceId,
              mediaType: event.mediaType,
              title: event.title,
              filename: event.filename,
            });
            // Track for late-joiners (operator only)
            if (!isThread) {
              streamState.sources.push({
                sourceType: "document",
                id: event.sourceId,
                title: event.title,
              });
            }
            break;
          }

          case "file": {
            await this.store.appendPart(targetMessageId, {
              type: "file",
              mediaType: event.mediaType,
              url: event.url,
              filename: event.filename,
            } as FileUIPart);
            break;
          }
        }

        onEvent?.(event);
        this.emit(conversationId, { ...event, conversationId });
      };

      const stream = this.agent.chatStream(history, capabilities, handleStreamEvent, subagentCtx);

      let fullText = "";
      for await (const delta of stream) {
        // Accumulate text
        fullText += delta;
        streamState.partialText += delta;

        // Start or update text part
        if (!operatorCtx.hasStartedTextPart) {
          await this.store.appendPart(assistantMessageId, {
            type: "text",
            text: delta,
            state: "streaming",
          } as TextUIPart);
          operatorCtx.hasStartedTextPart = true;
          operatorCtx.fullText = delta;
        } else {
          operatorCtx.fullText += delta;
          await this.store.updateTextPart(assistantMessageId, operatorCtx.fullText);
        }

        this.emit(conversationId, { type: "delta", conversationId, text: delta });
        yield delta;
      }

      // Finalize the assistant message (set text part state to done)
      await this.store.finalizeMessage(assistantMessageId);

      // Clear active stream state
      this.activeStreams.delete(conversationId);

      this.emit(conversationId, { type: "done", conversationId });

      const durationMs = Date.now() - startTime;
      logger.messageSent(channelName, conversationId, fullText.length, durationMs);
    } finally {
      releaseLock();
    }
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
    this.emit(conversationId, { type: "cleared", conversationId });
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
  ): Promise<UIMessage[]> {
    return this.store.getHistory(conversationId);
  }

  /** Get child threads (subagent conversations) for a parent conversation. */
  async getChildThreads(conversationId: string): Promise<ConversationInfo[]> {
    return this.store.getChildThreads(conversationId);
  }
}
