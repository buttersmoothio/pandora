/**
 * Memory Tools - Agent-controlled memory operations
 *
 * These tools are auto-injected when memory is configured (not via defineTool).
 * Episodic memory is automatic (gateway-managed), so tools handle semantic memory.
 * The recall tool searches both episodic and semantic memories.
 */

import { tool, type Tool } from "ai";
import { z } from "zod";
import type { IMemoryProvider, IMessageStore } from "@pandora/core";

/** Memory category options */
const CATEGORIES = ["user_preference", "knowledge", "instruction"] as const;

/**
 * Create memory tools for the agent.
 * Called from index.ts when memory is available, then injected into the Agent.
 *
 * @param provider - Memory provider instance
 * @param store - Message store (for recallConversation)
 * @returns Record of memory tools
 */
export function createMemoryTools(
  provider: IMemoryProvider,
  store: IMessageStore
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  // Only add remember tool if semantic memory is available
  if (provider.semantic) {
    tools.remember = tool({
      description:
        "Store a fact, preference, or piece of knowledge for future reference. " +
        "Use this to remember user preferences, important facts, or instructions. " +
        "Examples: 'User prefers dark mode', 'Project uses TypeScript', 'Always format dates as YYYY-MM-DD'.",
      inputSchema: z.object({
        content: z
          .string()
          .describe("The fact, preference, or knowledge to remember"),
        category: z
          .enum(CATEGORIES)
          .optional()
          .default("knowledge")
          .describe(
            "Category: 'user_preference' for personal preferences, 'knowledge' for facts, 'instruction' for directives"
          ),
      }),
      execute: async ({ content, category }) => {
        const id = await provider.semantic!.upsertFact({
          content,
          vector: [], // Will be computed by provider
          category: category ?? "knowledge",
          confidence: 1.0,
        });

        return {
          success: true,
          id,
          message: `Stored ${category}: "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}"`,
        };
      },
    });
  }

  // Recall tool always available (searches both types)
  tools.recall = tool({
    description:
      "Search your memories for relevant information. " +
      "Use this to find past interactions, stored facts, and preferences. " +
      "Returns both episodic memories (past interactions) and semantic memories (stored facts).",
    inputSchema: z.object({
      query: z.string().describe("What to search for in memory"),
      type: z
        .enum(["all", "episodes", "facts"])
        .optional()
        .default("all")
        .describe("Type of memories to search: 'all', 'episodes' (past interactions), or 'facts' (stored knowledge)"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
    }),
    execute: async ({ query, type, limit }) => {
      const opts = { limit: limit ?? 5, minScore: 0.5 };

      if (type === "episodes" && provider.episodic) {
        const episodes = await provider.episodic.searchEpisodes(query, opts);
        return {
          episodes: episodes.map((r) => ({
            id: r.item.id,
            content: r.item.content,
            score: r.score.toFixed(3),
            timestamp: new Date(r.item.timestamp * 1000).toISOString(),
            conversationId: r.item.conversationId,
          })),
          facts: [],
        };
      }

      if (type === "facts" && provider.semantic) {
        const facts = await provider.semantic.searchFacts(query, opts);
        return {
          episodes: [],
          facts: facts.map((r) => ({
            id: r.item.id,
            content: r.item.content,
            score: r.score.toFixed(3),
            category: r.item.category,
          })),
        };
      }

      // Search all
      const results = await provider.search(query, opts);
      return {
        episodes: results.episodes.map((r) => ({
          id: r.item.id,
          content: r.item.content,
          score: r.score.toFixed(3),
          timestamp: new Date(r.item.timestamp * 1000).toISOString(),
          conversationId: r.item.conversationId,
        })),
        facts: results.facts.map((r) => ({
          id: r.item.id,
          content: r.item.content,
          score: r.score.toFixed(3),
          category: r.item.category,
        })),
      };
    },
  });

  // Forget tool - only for semantic memories (facts)
  // Episodic memories are managed automatically and deleted with conversations
  if (provider.semantic) {
    tools.forget = tool({
      description:
        "Remove a stored fact by its ID. " +
        "Use this to delete outdated or incorrect facts/preferences/knowledge. " +
        "Note: Episodic memories (past interactions) cannot be deleted directly - they are cleaned up when conversations are deleted.",
      inputSchema: z.object({
        id: z.string().describe("The ID of the fact to delete (from recall results)"),
      }),
      execute: async ({ id }) => {
        await provider.semantic!.deleteFact(id);
        return { success: true, message: `Deleted fact: ${id}` };
      },
    });
  }

  // RecallConversation tool - fetch full history for a past conversation
  tools.recallConversation = tool({
    description:
      "Fetch the full message history for a past conversation. " +
      "Use this when an episodic memory references a conversation you want to review in detail. " +
      "The conversationId comes from episodic memory search results.",
    inputSchema: z.object({
      conversationId: z.string().describe("The conversation ID to fetch history for"),
    }),
    execute: async ({ conversationId }) => {
      const history = await store.getHistory(conversationId);

      if (history.length === 0) {
        return {
          success: false,
          message: `No messages found for conversation: ${conversationId}`,
        };
      }

      // Format messages for the agent
      const messages = history.map((msg) => {
        // Extract text content from parts
        const textParts = msg.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("\n");

        return {
          role: msg.role,
          content: textParts || "[non-text content]",
        };
      });

      return {
        success: true,
        conversationId,
        messageCount: messages.length,
        messages,
      };
    },
  });

  return tools;
}

/** Names of memory tools (for subagent opt-out filtering) */
export const MEMORY_TOOL_NAMES = ["remember", "recall", "forget", "recallConversation"] as const;
