/**
 * Memory Tools - Agent-controlled memory operations
 *
 * These tools are auto-injected when memory is configured (not via defineTool).
 * Episodic memory is automatic (gateway-managed), so tools handle semantic memory.
 * The recall tool searches both episodic and semantic memories (returns chunks).
 * The getMemory tool fetches full records when needed.
 */

import { tool, type Tool } from "ai";
import { z } from "zod";
import { MEMORY_TOOL_NAMES, requestContext, type IMemoryProvider } from "@pandora/core";

// Re-export for convenience
export { MEMORY_TOOL_NAMES };

/** Memory category options */
const CATEGORIES = ["user_preference", "knowledge", "instruction"] as const;

/**
 * Create memory tools for the agent.
 * Called from index.ts when memory is available, then injected into the Agent.
 *
 * @param provider - Memory provider instance
 * @returns Record of memory tools
 */
export function createMemoryTools(provider: IMemoryProvider): Record<string, Tool> {
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

  // Recall tool - searches both memory types, returns matching chunks
  tools.recall = tool({
    description:
      "Search your memories for relevant information. " +
      "Returns matching chunks from past interactions (episodes) and stored facts. " +
      "Use getMemory to fetch the full content of a memory record if needed.",
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
      const excludeConversationId = requestContext.getStore()?.conversationId;
      const opts = { limit: limit ?? 5, minScore: 0.5 };

      if (type === "episodes" && provider.episodic) {
        const chunks = await provider.episodic.searchEpisodes(query, opts);
        const filtered = excludeConversationId
          ? chunks.filter((c) => c.conversationId !== excludeConversationId)
          : chunks;
        return {
          episodes: filtered.map((c) => ({
            chunkId: c.chunkId,
            content: c.content,
            score: c.score.toFixed(3),
            parentId: c.parentId,
            chunkIndex: c.chunkIndex,
            timestamp: c.timestamp ? new Date(c.timestamp * 1000).toISOString() : undefined,
            conversationId: c.conversationId,
          })),
          facts: [],
        };
      }

      if (type === "facts" && provider.semantic) {
        const chunks = await provider.semantic.searchFacts(query, opts);
        return {
          episodes: [],
          facts: chunks.map((c) => ({
            chunkId: c.chunkId,
            content: c.content,
            score: c.score.toFixed(3),
            parentId: c.parentId,
            chunkIndex: c.chunkIndex,
            category: c.category,
          })),
        };
      }

      // Search all
      const results = await provider.search(query, { ...opts, excludeConversationId });
      return {
        episodes: results.episodes.map((c) => ({
          chunkId: c.chunkId,
          content: c.content,
          score: c.score.toFixed(3),
          parentId: c.parentId,
          chunkIndex: c.chunkIndex,
          timestamp: c.timestamp ? new Date(c.timestamp * 1000).toISOString() : undefined,
          conversationId: c.conversationId,
        })),
        facts: results.facts.map((c) => ({
          chunkId: c.chunkId,
          content: c.content,
          score: c.score.toFixed(3),
          parentId: c.parentId,
          chunkIndex: c.chunkIndex,
          category: c.category,
        })),
      };
    },
  });

  // GetMemory tool - fetch full episode or fact by ID
  tools.getMemory = tool({
    description:
      "Fetch the full content of a memory record by its ID. " +
      "Use this when you need the complete context from a recall result. " +
      "The parentId comes from recall search results.",
    inputSchema: z.object({
      id: z.string().describe("The parent ID of the memory to fetch"),
      type: z
        .enum(["episode", "fact"])
        .describe("Type of memory: 'episode' or 'fact'"),
    }),
    execute: async ({ id, type }) => {
      if (type === "episode" && provider.episodic) {
        const episode = await provider.episodic.getEpisode(id);
        if (!episode) {
          return { success: false, message: `Episode not found: ${id}` };
        }
        return {
          success: true,
          type: "episode",
          id: episode.id,
          content: episode.content,
          timestamp: new Date(episode.timestamp * 1000).toISOString(),
          conversationId: episode.conversationId,
          channelName: episode.channelName,
          importance: episode.importance,
          tags: episode.tags,
        };
      }

      if (type === "fact" && provider.semantic) {
        const fact = await provider.semantic.getFact(id);
        if (!fact) {
          return { success: false, message: `Fact not found: ${id}` };
        }
        return {
          success: true,
          type: "fact",
          id: fact.id,
          content: fact.content,
          category: fact.category,
          createdAt: new Date(fact.createdAt * 1000).toISOString(),
          updatedAt: new Date(fact.updatedAt * 1000).toISOString(),
          confidence: fact.confidence,
          source: fact.source,
        };
      }

      return { success: false, message: `Memory type not available: ${type}` };
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
        id: z.string().describe("The parent ID of the fact to delete (from recall results)"),
      }),
      execute: async ({ id }) => {
        await provider.semantic!.deleteFact(id);
        return { success: true, message: `Deleted fact: ${id}` };
      },
    });
  }

  return tools;
}
