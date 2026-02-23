import type { Mastra } from '@mastra/core'
import type { FullOutput } from '@mastra/core/stream'
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

/** Get Memory instance from agent, throw if not configured */
async function getMemory(mastra: Mastra): Promise<Memory> {
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) throw new Error('Memory not configured')
  return memory as Memory
}

/** Map a Mastra FullOutput to a GenerateResult */
function buildResult(result: FullOutput): GenerateResult {
  return {
    text: result.text,
    sources: result.sources,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    files: result.files,
    reasoning: result.reasoning,
    reasoningText: result.reasoningText ?? undefined,
    usage: result.usage,
    runId: result.runId ?? undefined,
    pendingToolApproval:
      result.finishReason === 'suspended' && result.suspendPayload
        ? {
            toolCallId: result.suspendPayload.toolCallId,
            toolName: result.suspendPayload.toolName,
            args: result.suspendPayload.args,
          }
        : undefined,
  }
}

/**
 * Create a ChannelRuntime — the gateway that channels use to
 * send messages to the LLM and manage threads.
 */
export function createChannelRuntime(deps: ChannelRuntimeDeps): ChannelRuntime {
  const { mastra, env } = deps

  // Metadata for threads not yet created in the DB. When newThread is called
  // we stash metadata here instead of pre-creating the thread, so Mastra can
  // create it during generate/stream and fire generateTitle.
  const pendingMeta = new Map<string, Record<string, unknown>>()

  /** Memory option — passes full thread object for new threads so Mastra creates them with metadata. */
  function memoryOption(threadId: string) {
    const metadata = pendingMeta.get(threadId)
    if (metadata) {
      pendingMeta.delete(threadId)
      return { thread: { id: threadId, metadata }, resource: RESOURCE_ID }
    }
    return { thread: threadId, resource: RESOURCE_ID }
  }

  return {
    env,

    async generate({ threadId, parts }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.generate(buildMessages(parts), {
        memory: memoryOption(threadId),
      })
      return buildResult(result)
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

    async approveToolCall({ runId, toolCallId }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.approveToolCallGenerate({ runId, toolCallId })
      return buildResult(result)
    },

    async declineToolCall({ runId, toolCallId }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.declineToolCallGenerate({ runId, toolCallId })
      return buildResult(result)
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
      const threadId = crypto.randomUUID()
      // Don't create the thread in the DB yet — stash metadata so Mastra
      // creates it (with generateTitle) when generate/stream is called.
      pendingMeta.set(threadId, { channel: channelId, externalId, root: true })
      return threadId
    },
  }
}
