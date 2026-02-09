/**
 * MemoryStore - In-memory conversation history storage
 *
 * Fast, ephemeral storage. Conversations are lost on restart.
 * Useful for development/testing or when persistence isn't needed.
 *
 * Uses parts-based storage for UIMessage compatibility.
 */

import {
  defineStore,
  generateId,
  type IMessageStore,
  type ConversationInfo,
  type MessageMeta,
  type UIMessage,
  type UIMessagePart,
  type TextUIPart,
} from "@pandora/core";

interface ConversationMeta {
  channelName?: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
  type: "root" | "subagent";
  parentConversationId?: string;
  parentToolCallId?: string;
  subagentName?: string;
}

/** Token usage for a message */
interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Extended message with channelName and usage for per-message tracking */
type MessageWithChannel = UIMessage & {
  channelName?: string;
  usage?: MessageUsage;
};

/** In-memory message store. Ephemeral; conversations are lost on restart. */
export class MemoryStore implements IMessageStore {
  /** Map of conversationId -> messages in order */
  private conversations = new Map<string, MessageWithChannel[]>();
  /** Map of messageId -> message for fast lookup */
  private messagesById = new Map<string, MessageWithChannel>();
  /** Map of conversationId -> metadata */
  private metadata = new Map<string, ConversationMeta>();

  /** Helper to get or initialize conversation metadata */
  private ensureConversation(
    conversationId: string,
    meta?: MessageMeta
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.metadata.get(conversationId);

    if (!existing) {
      this.metadata.set(conversationId, {
        channelName: meta?.channelName,
        userId: meta?.userId,
        createdAt: now,
        updatedAt: now,
        type: "root",
      });
      this.conversations.set(conversationId, []);
    } else {
      existing.updatedAt = now;
    }
  }

  /** @inheritdoc */
  async addMessage(
    conversationId: string,
    message: Omit<UIMessage, "id">,
    meta?: MessageMeta
  ): Promise<string> {
    this.ensureConversation(conversationId, meta);

    const messageId = generateId();
    const fullMessage: MessageWithChannel = {
      id: messageId,
      role: message.role,
      parts: [...message.parts],
      channelName: meta?.channelName,
    };

    this.conversations.get(conversationId)!.push(fullMessage);
    this.messagesById.set(messageId, fullMessage);

    return messageId;
  }

  /** @inheritdoc */
  async getHistory(conversationId: string): Promise<UIMessage[]> {
    return this.conversations.get(conversationId) ?? [];
  }

  /** @inheritdoc */
  async clearHistory(conversationId: string): Promise<void> {
    const messages = this.conversations.get(conversationId);
    if (messages) {
      for (const msg of messages) {
        this.messagesById.delete(msg.id);
      }
    }
    this.conversations.delete(conversationId);
    this.metadata.delete(conversationId);
  }

  /** @inheritdoc */
  async createMessage(
    conversationId: string,
    role: "user" | "assistant",
    meta?: MessageMeta
  ): Promise<string> {
    this.ensureConversation(conversationId, meta);

    const messageId = generateId();
    const message: MessageWithChannel = {
      id: messageId,
      role,
      parts: [],
      channelName: meta?.channelName,
    };

    this.conversations.get(conversationId)!.push(message);
    this.messagesById.set(messageId, message);

    return messageId;
  }

  /** @inheritdoc */
  async appendPart(messageId: string, part: UIMessagePart): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    message.parts.push(part);

    // Update conversation timestamp
    for (const [convId, messages] of this.conversations) {
      if (messages.includes(message)) {
        const meta = this.metadata.get(convId);
        if (meta) {
          meta.updatedAt = Math.floor(Date.now() / 1000);
        }
        break;
      }
    }
  }

  /** @inheritdoc */
  async updateToolResult(
    messageId: string,
    toolCallId: string,
    result: unknown
  ): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Find the tool part with matching toolCallId
    for (const part of message.parts) {
      if (
        part.type === "dynamic-tool" &&
        (part as any).toolCallId === toolCallId
      ) {
        (part as any).state = "output-available";
        (part as any).output = result;
        break;
      }
    }
  }

  /** @inheritdoc */
  async updateTextPart(messageId: string, text: string): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Find the last text part and update it
    for (let i = message.parts.length - 1; i >= 0; i--) {
      const part = message.parts[i];
      if (part && part.type === "text") {
        (part as TextUIPart).text = text;
        break;
      }
    }
  }

  /** @inheritdoc */
  async finalizeMessage(messageId: string): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Finalize any streaming text parts
    for (const part of message.parts) {
      if (part.type === "text" && (part as TextUIPart).state === "streaming") {
        (part as TextUIPart).state = "done";
      }
    }
  }

  /** @inheritdoc */
  async accumulateUsage(
    messageId: string,
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  ): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    if (!message.usage) {
      message.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    message.usage.inputTokens += usage.inputTokens ?? 0;
    message.usage.outputTokens += usage.outputTokens ?? 0;
    message.usage.totalTokens += usage.totalTokens ?? 0;
  }

  /** @inheritdoc */
  async listConversations(channelName?: string): Promise<ConversationInfo[]> {
    const results: ConversationInfo[] = [];

    for (const [id, messages] of this.conversations) {
      const meta = this.metadata.get(id);
      if (channelName && meta?.channelName !== channelName) continue;
      // Exclude subagent threads from the main list
      if (meta?.type !== "root") continue;

      // Find first user message's first text part for preview
      let preview = "";
      const firstUserMsg = messages.find((m) => m.role === "user");
      if (firstUserMsg) {
        const textPart = firstUserMsg.parts.find(
          (p) => p.type === "text"
        ) as TextUIPart | undefined;
        if (textPart) {
          preview = textPart.text.slice(0, 100);
        }
      }

      results.push({
        id,
        channelName: meta?.channelName ?? null,
        createdAt: meta?.createdAt ?? 0,
        updatedAt: meta?.updatedAt ?? 0,
        preview,
        messageCount: messages.length,
      });
    }

    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** @inheritdoc */
  async deleteConversation(conversationId: string): Promise<void> {
    const messages = this.conversations.get(conversationId);
    if (messages) {
      for (const msg of messages) {
        this.messagesById.delete(msg.id);
      }
    }
    this.conversations.delete(conversationId);
    this.metadata.delete(conversationId);
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    // No-op for in-memory storage
  }

  /** @inheritdoc */
  async createSubagentConversation(
    parentId: string,
    toolCallId: string,
    subagentName: string,
    meta?: MessageMeta
  ): Promise<string> {
    const conversationId = generateId();
    const now = Math.floor(Date.now() / 1000);

    this.metadata.set(conversationId, {
      channelName: meta?.channelName,
      userId: meta?.userId,
      createdAt: now,
      updatedAt: now,
      type: "subagent",
      parentConversationId: parentId,
      parentToolCallId: toolCallId,
      subagentName,
    });
    this.conversations.set(conversationId, []);

    return conversationId;
  }

  /** @inheritdoc */
  async linkToolToThread(
    messageId: string,
    toolCallId: string,
    threadId: string
  ): Promise<void> {
    const message = this.messagesById.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Find the tool part with matching toolCallId and add threadId
    for (const part of message.parts) {
      if (
        part.type === "dynamic-tool" &&
        (part as any).toolCallId === toolCallId
      ) {
        (part as any).threadId = threadId;
        break;
      }
    }
  }

  /** @inheritdoc */
  async getChildThreads(conversationId: string): Promise<ConversationInfo[]> {
    const results: ConversationInfo[] = [];

    for (const [id, messages] of this.conversations) {
      const meta = this.metadata.get(id);
      if (meta?.parentConversationId !== conversationId) continue;

      results.push({
        id,
        channelName: meta.channelName ?? null,
        createdAt: meta.createdAt ?? 0,
        updatedAt: meta.updatedAt ?? 0,
        preview: "",
        messageCount: messages.length,
        type: meta.type,
        parentConversationId: meta.parentConversationId,
        parentToolCallId: meta.parentToolCallId,
        subagentName: meta.subagentName,
      });
    }

    return results.sort((a, b) => a.createdAt - b.createdAt);
  }
}

// Self-register the store
export default defineStore({
  type: "memory",
  create: () => new MemoryStore(),
});
