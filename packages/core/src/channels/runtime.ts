import type { Mastra } from '@mastra/core'
import type { Memory } from '@mastra/memory'
import type {
  ChannelRuntime,
  ChannelRuntimeDeps,
  GenerateResult,
  MessagePart,
  StreamResult,
} from './types'

const RESOURCE_ID = 'default'

/**
 * Build the message array that Mastra's agent.generate/stream expects.
 * Uses the UIMessage format (same as POST /api/chat).
 */
function buildMessages(parts: MessagePart[]) {
  return [{ id: crypto.randomUUID(), role: 'user' as const, parts }]
}

/** Memory option for agent calls */
function memoryOption(threadId: string) {
  return { thread: threadId, resource: RESOURCE_ID }
}

/** Get Memory instance from agent, throw if not configured */
async function getMemory(mastra: Mastra): Promise<Memory> {
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) throw new Error('Memory not configured')
  return memory as Memory
}

/**
 * Create a ChannelRuntime — the gateway that channels use to
 * send messages to the LLM and manage threads.
 */
export function createChannelRuntime(deps: ChannelRuntimeDeps): ChannelRuntime {
  const { mastra, env } = deps

  return {
    env,

    async generate({ threadId, parts }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.generate(buildMessages(parts), {
        memory: memoryOption(threadId),
      })

      return {
        text: result.text,
        sources: result.sources,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        files: result.files,
        reasoning: result.reasoning,
        reasoningText: result.reasoningText ?? undefined,
        usage: result.usage,
      } satisfies GenerateResult
    },

    async stream({ threadId, parts }) {
      const agent = mastra.getAgent('operator')
      const output = await agent.stream(buildMessages(parts), {
        memory: memoryOption(threadId),
      })

      return {
        textStream: output.textStream,
        text: output.text,
        sources: output.sources,
        toolCalls: output.toolCalls,
        toolResults: output.toolResults,
        files: output.files,
        reasoning: output.reasoning,
        reasoningText: output.reasoningText,
        usage: output.usage,
      } satisfies StreamResult
    },

    async resolveThread(channelId, externalId) {
      const memory = await getMemory(mastra)

      // Look for existing thread with matching channel+externalId metadata
      const result = await memory.listThreads({
        filter: {
          resourceId: RESOURCE_ID,
          metadata: { channel: channelId, externalId },
        },
        orderBy: { field: 'updatedAt', direction: 'DESC' },
        perPage: 1,
      })

      if (result.threads.length > 0) {
        return result.threads[0].id
      }

      // No existing thread — create one
      return this.newThread(channelId, externalId)
    },

    async newThread(channelId, externalId) {
      const memory = await getMemory(mastra)
      const threadId = crypto.randomUUID()
      await memory.createThread({
        resourceId: RESOURCE_ID,
        threadId,
        metadata: { channel: channelId, externalId, root: true },
      })
      return threadId
    },
  }
}
