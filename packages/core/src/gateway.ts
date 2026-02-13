/**
 * Gateway - Central message routing hub
 *
 * Orchestrates the flow between channels, message store, and AI agent.
 * - Receives messages from channels
 * - Stores them in MessageStore (incrementally during streaming)
 * - Passes to Agent with history
 * - Parts are persisted as they stream in
 * - Manages context window tracking and compaction
 */

import type { LanguageModel } from "ai";
import type { Agent } from "./agent";
import type { IMessageStore, ConversationInfo, SubagentContext, IMemoryProvider } from "./registries";
import { requestContext } from "./request-context";
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
import { ContextManager, CompactionManager, type ContextState, type TokenUsage, type TokenCosts } from "./context";

/** Per-thread state for parallel thread support */
interface ThreadContext {
  threadId: string;
  assistantMessageId: string;
  fullText: string;
  hasStartedTextPart: boolean;
  accumulatedReasoning: string;
}

/** Lock acquisition timeout (ms). Prevents permanent blocking if a handler fails. */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type GatewayListener = (event: GatewayEvent) => void;

/** Options for Gateway context management */
export interface GatewayContextOptions {
  /** Operator model ID for context tracking (e.g., "anthropic/claude-sonnet-4.5") */
  operatorModelId: string;
  /** Model to use for summarization */
  summaryModel: LanguageModel;
}

/** State of an active subagent thread for late-joining subscribers. */
export interface ActiveThreadState {
  threadId: string;
  toolCallId: string;
  subagentName: string;
  partialText: string;
  status: "streaming" | "done";
}

/** State of an active stream for late-joining subscribers. */
export interface ActiveStreamState {
  conversationId: string;
  channelName: string;
  userContent: string;
  partialText: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown; result?: unknown }>;
  sources: Array<{ sourceType: string; id: string; url?: string; title?: string }>;
  reasoning: string;
  threads: Record<string, ActiveThreadState>;
  /** Memory context recalled for this prompt (for persistence) */
  memoryContext?: {
    facts: Array<{ content: string; category?: string; score: number }>;
    episodes: Array<{ content: string; timestamp?: number; score: number }>;
  };
}

/** Central hub: receives messages from channels, stores them, calls the agent, stores and returns the response. */
export class Gateway {
  private listeners = new Map<string, Set<GatewayListener>>();
  private globalListeners = new Set<GatewayListener>();
  private activeStreams = new Map<string, ActiveStreamState>();
  /** Per-conversation locks to serialize message processing. */
  private conversationLocks = new Map<string, Promise<void>>();
  /** Optional memory provider for auto-recall and auto-episode. */
  private memory: IMemoryProvider | null;
  /** Context manager for token counting and health tracking. */
  private contextManager: ContextManager;
  /** Compaction manager for conversation summarization. */
  private compactionManager: CompactionManager;
  /** Operator model ID for context tracking. */
  private operatorModelId: string;
  /** Model to use for summarization. */
  private summaryModel: LanguageModel;

  /**
   * @param store - Message store for conversation history.
   * @param agent - AI agent for generating responses.
   * @param memory - Optional memory provider for auto-recall and auto-episode.
   * @param contextOptions - Context management configuration (always enabled).
   */
  constructor(
    private store: IMessageStore,
    private agent: Agent,
    memory: IMemoryProvider | null,
    contextOptions: GatewayContextOptions
  ) {
    this.memory = memory;
    this.operatorModelId = contextOptions.operatorModelId;
    this.summaryModel = contextOptions.summaryModel;
    this.contextManager = new ContextManager();
    this.compactionManager = new CompactionManager(this.contextManager);
  }

  /**
   * Acquire a lock for a conversation. Ensures only one message is processed at a time per conversation.
   * Chains onto any existing lock, with a timeout to prevent permanent blocking.
   * @returns Release function to call when done.
   */
  private async acquireConversationLock(conversationId: string): Promise<() => void> {
    const existing = this.conversationLocks.get(conversationId);

    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.conversationLocks.set(conversationId, lock);

    // Wait for any existing lock to release, with a timeout
    if (existing) {
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), LOCK_TIMEOUT_MS)
      );
      const result = await Promise.race([existing.then(() => "released" as const), timeout]);
      if (result === "timeout") {
        logger.warn("Gateway", `Lock timeout for conversation ${conversationId}, proceeding`);
      }
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
    let fullText = "";
    for await (const delta of this.handleMessageStream(message, capabilities)) {
      fullText += delta;
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
    let assistantMessageId: string | undefined;

    try {
      requestContext.enterWith({ conversationId, channelName });
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
        threads: {},
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
      let history = await this.store.getHistory(conversationId);

      // Track accumulated usage for this turn
      let turnUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      // Compute accumulated costs on-demand from stored usage
      const storedUsage = await this.store.getConversationUsage(conversationId);
      const accumulatedCosts = await this.contextManager.computeCostsFromUsage(
        this.operatorModelId,
        storedUsage
      );
      let contextState = await this.contextManager.getState(this.operatorModelId, history, accumulatedCosts);

      // Emit context state to subscribers
      const contextEvent: StreamEvent = {
        type: "context-state",
        conversationId,
        state: contextState,
      };
      onEvent?.(contextEvent);
      this.emit(conversationId, { ...contextEvent, conversationId });

      // Check if compaction is needed BEFORE this turn
      if (contextState.health.shouldCompact) {
        logger.info("Gateway", `Context at ${contextState.health.percentUsed.toFixed(1)}%, triggering compaction`);

        const compactionResult = await this.compactionManager.compact(
          history,
          contextState.health,
          this.summaryModel
        );

        // Update history with compacted version
        history = compactionResult.history;

        // Store compacted history back
        await this.store.replaceHistory(conversationId, history);

        // Create episode from the summarized content (replaces per-turn episode)
        let episodeId: string | undefined;
        if (this.memory?.episodic && compactionResult.summary) {
          try {
            episodeId = await this.memory.episodic.addEpisode({
              content: compactionResult.summary,
              conversationId,
              channelName,
              userId,
              timestamp: Math.floor(Date.now() / 1000),
              importance: 0.7, // Higher importance for summarized content
              tags: ["compaction"],
            });
            logger.info("Gateway", `Created compaction episode: ${episodeId}`);
          } catch (err) {
            logger.warn("Gateway", `Failed to create compaction episode: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Emit compaction event
        const compactionEvent: StreamEvent = {
          type: "compaction",
          conversationId,
          beforeTokens: compactionResult.beforeTokens,
          afterTokens: compactionResult.afterTokens,
          removed: compactionResult.removedCount,
          episodeId,
        };
        onEvent?.(compactionEvent);
        this.emit(conversationId, { ...compactionEvent, conversationId });

        // Refresh context state after compaction
        contextState = await this.contextManager.getState(this.operatorModelId, history, contextState.costs);
      }

      // Auto-recall: search memory for brief context hints (if memory is available)
      // Injects truncated summaries with IDs — the model can use getMemory() for full details.
      let memoryContext: string | undefined;
      if (this.memory) {
        try {
          const results = await this.memory.search(content, { limit: 8, minScore: 0.5, excludeConversationId: conversationId });
          const contextParts: string[] = [];

          // Deduplicate chunks by parent - keep highest scoring chunk per parent
          const dedupeByParent = <T extends { parentId: string; score: number }>(chunks: T[]): T[] => {
            const byParent = new Map<string, T>();
            for (const chunk of chunks) {
              const existing = byParent.get(chunk.parentId);
              if (!existing || chunk.score > existing.score) {
                byParent.set(chunk.parentId, chunk);
              }
            }
            return [...byParent.values()].sort((a, b) => b.score - a.score);
          };

          const uniqueFacts = dedupeByParent(results.facts).slice(0, 3);
          const uniqueEpisodes = dedupeByParent(results.episodes).slice(0, 2);

          const truncate = (text: string, max: number) =>
            text.length <= max ? text : text.slice(0, max) + "…";

          if (uniqueFacts.length > 0) {
            contextParts.push("**Remembered:**");
            for (const chunk of uniqueFacts) {
              contextParts.push(`- [${chunk.category ?? "knowledge"}] ${truncate(chunk.content, 120)} (id: ${chunk.parentId})`);
            }
          }

          if (uniqueEpisodes.length > 0) {
            if (contextParts.length > 0) contextParts.push("");
            contextParts.push("**Past interactions:**");
            for (const chunk of uniqueEpisodes) {
              const timestamp = chunk.timestamp
                ? new Date(chunk.timestamp * 1000).toLocaleDateString()
                : "unknown";
              contextParts.push(`- [${timestamp}] ${truncate(chunk.content, 120)} (id: ${chunk.parentId})`);
            }
          }

          if (contextParts.length > 0) {
            contextParts.push("");
            contextParts.push("Use `getMemory` with an ID above to retrieve the full content if needed.");
            memoryContext = contextParts.join("\n");
            logger.info("Gateway", `Auto-recalled ${uniqueFacts.length} facts, ${uniqueEpisodes.length} episodes (deduped from ${results.facts.length}/${results.episodes.length})`);

            streamState.memoryContext = {
              facts: uniqueFacts.map(f => ({
                content: truncate(f.content, 120),
                category: f.category,
                score: f.score,
              })),
              episodes: uniqueEpisodes.map(e => ({
                content: truncate(e.content, 120),
                timestamp: e.timestamp,
                score: e.score,
              })),
            };
          }
        } catch (err) {
          // Memory failure should never break chat
          logger.warn("Gateway", `Auto-recall failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Create assistant message shell before streaming
      assistantMessageId = await this.store.createMessage(conversationId, "assistant", meta);

      // Persist and emit memory-context if we recalled any memories
      if (streamState.memoryContext) {
        const { facts, episodes } = streamState.memoryContext;
        // Persist as a message part
        await this.store.appendPart(assistantMessageId, {
          type: "memory-context",
          facts,
          episodes,
        });
        // Emit for real-time UI updates
        const memoryEvent: StreamEvent = {
          type: "memory-context",
          facts,
          episodes,
        };
        onEvent?.(memoryEvent);
        this.emit(conversationId, { ...memoryEvent, conversationId });
      }

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

          // Track thread for late-joining subscribers
          streamState.threads[threadId] = {
            threadId,
            toolCallId,
            subagentName,
            partialText: "",
            status: "streaming",
          };

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
          // Update late-join state
          const threadState = streamState.threads[event.threadId];
          if (threadState) threadState.status = "done";

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
            // Track for late-joiners
            if (isThread) {
              const threadState = streamState.threads[event.threadId!];
              if (threadState) threadState.partialText += event.text;
            } else {
              streamState.partialText += event.text;
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
              await this.store.linkToolToThread(assistantMessageId!, event.toolCallId, event.threadId);
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
            // Not stored - step boundaries are implicit in tool call sequences
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
            // Accumulate token usage with full details (for store and context tracking)
            if (event.usage) {
              // Extract all token details from LanguageModelUsage
              const usage = {
                inputTokens: event.usage.inputTokens ?? 0,
                outputTokens: event.usage.outputTokens ?? 0,
                totalTokens: event.usage.totalTokens ?? 0,
                cacheReadTokens: event.usage.inputTokenDetails?.cacheReadTokens ?? 0,
                cacheWriteTokens: event.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
                reasoningTokens: event.usage.outputTokenDetails?.reasoningTokens ?? 0,
              };
              await this.store.accumulateUsage(targetMessageId, usage, this.operatorModelId);
              // Track usage for this turn (operator only)
              if (!isThread) {
                turnUsage.inputTokens += usage.inputTokens;
                turnUsage.outputTokens += usage.outputTokens;
                turnUsage.totalTokens += usage.totalTokens;
              }
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

      const stream = this.agent.chatStream(history, capabilities, handleStreamEvent, subagentCtx, memoryContext);

      // Text persistence is handled by handleStreamEvent (text-delta case).
      // This loop only yields deltas to the caller and tracks total text for logging.
      let fullText = "";
      for await (const delta of stream) {
        fullText += delta;
        yield delta;
      }

      // Finalize the assistant message (set text part state to done)
      await this.store.finalizeMessage(assistantMessageId);

      // Update context state with turn usage (costs already computed on-demand)
      contextState = await this.contextManager.updateAfterTurn(contextState, turnUsage);

      // Emit conversation stats (aggregated across operator + subagents)
      const stats = this.contextManager.aggregateStats(contextState, {});
      const statsEvent: StreamEvent = {
        type: "conversation-stats",
        conversationId,
        stats,
      };
      onEvent?.(statsEvent);
      this.emit(conversationId, { ...statsEvent, conversationId });

      // NOTE: Per-turn auto-episode has been removed.
      // Episodes are now created during compaction events (see compaction handling above).
      // This results in higher-quality, consolidated episodes instead of low-value per-turn fragments.

      this.emit(conversationId, { type: "done", conversationId });

      const durationMs = Date.now() - startTime;
      logger.messageSent(channelName, conversationId, fullText.length, durationMs);
    } catch (error) {
      logger.error("Gateway", "Message stream failed", error);
      // Finalize the message to avoid zombie streaming state in the store
      if (assistantMessageId) {
        try {
          await this.store.finalizeMessage(assistantMessageId);
        } catch (finalizeError) {
          logger.warn("Gateway", "Failed to finalize message after error", { messageId: assistantMessageId });
        }
      }

      this.emit(conversationId, {
        type: "error",
        conversationId,
        message: error instanceof Error ? error.message : "Stream failed",
      });
      throw error;
    } finally {
      this.activeStreams.delete(conversationId);
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
    logger.info("Gateway", "Clearing conversation", { conversationId });
    await this.store.clearHistory(conversationId);
    this.emit(conversationId, { type: "cleared", conversationId });
  }

  /** List conversations, optionally filtered by channel name. */
  async listConversations(channelName?: string): Promise<ConversationInfo[]> {
    return this.store.listConversations(channelName);
  }

  /** Delete a conversation and all its messages. */
  async deleteConversation(conversationId: string): Promise<void> {
    logger.info("Gateway", "Deleting conversation", { conversationId });
    // Delete conversation from store
    await this.store.deleteConversation(conversationId);

    // Also delete any episodic memories for this conversation
    if (this.memory?.episodic) {
      try {
        await this.memory.episodic.deleteEpisodesForConversation(conversationId);
      } catch (err) {
        logger.warn("Gateway", `Failed to delete episodic memories: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** Get conversation history for a specific conversation. */
  async getConversationHistory(
    conversationId: string
  ): Promise<UIMessage[]> {
    return this.store.getHistory(conversationId);
  }

  /**
   * Get context state for a conversation (for UI display on load).
   * Computes token usage, health, and costs from stored history.
   * Uses actual API token counts when available (more accurate than estimation).
   */
  async getContextState(conversationId: string): Promise<ContextState> {
    const history = await this.store.getHistory(conversationId);
    const storedUsage = await this.store.getConversationUsage(conversationId);
    const accumulatedCosts = await this.contextManager.computeCostsFromUsage(
      this.operatorModelId,
      storedUsage
    );

    // Get actual context size from last assistant message's inputTokens
    // This is the real token count from the API, not an estimate
    const lastUsage = await this.store.getLastMessageUsage(conversationId);
    const actualUsedTokens = lastUsage?.inputTokens;

    return this.contextManager.getState(this.operatorModelId, history, accumulatedCosts, actualUsedTokens);
  }

  /** Get child threads (subagent conversations) for a parent conversation. */
  async getChildThreads(conversationId: string): Promise<ConversationInfo[]> {
    return this.store.getChildThreads(conversationId);
  }
}
