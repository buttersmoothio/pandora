import { toAISdkStream } from '@mastra/ai-sdk'
import type { Mastra } from '@mastra/core'
import type { FullOutput } from '@mastra/core/stream'
import type { Memory } from '@mastra/memory'
import { getLogger } from '../logger'
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
 * Convert Mastra approval chunks to AI SDK tool-approval-request format.
 * This transform bridges Mastra's `data-tool-call-approval` events to
 * the AI SDK's `tool-approval-request` format expected by the web UI.
 */
export function createApprovalTransform(): TransformStream {
  const log = getLogger()
  return new TransformStream({
    // biome-ignore lint/suspicious/noExplicitAny: stream chunks are untyped
    transform(chunk: any, controller) {
      if (chunk.type === 'data-tool-call-approval') {
        log.info('[ApprovalTransform] data-tool-call-approval → tool-approval-request', {
          runId: chunk.data.runId,
          toolCallId: chunk.data.toolCallId,
        })
        controller.enqueue({
          type: 'tool-approval-request',
          approvalId: chunk.data.runId,
          toolCallId: chunk.data.toolCallId,
        })
        return
      }
      if (chunk.type === 'data-tool-call-suspended') {
        log.info('[ApprovalTransform] suppressing data-tool-call-suspended')
        return
      }
      controller.enqueue(chunk)
    },
  })
}

interface PendingThread {
  threadId: string
  metadata: Record<string, unknown>
}

/**
 * Create a ChannelRuntime — the gateway that channels use to
 * send messages to the LLM and manage threads.
 */
export function createChannelRuntime(deps: ChannelRuntimeDeps): ChannelRuntime {
  const { mastra, env } = deps

  // Pending threads not yet created in the DB. Keyed by "channelId:externalId".
  // When newThread is called we stash here instead of pre-creating the thread,
  // so Mastra can create it during generate/stream and fire generateTitle.
  const pendingThreads = new Map<string, PendingThread>()

  /** Build memory option, consuming pending thread metadata if present. */
  function memoryOption(threadId: string, channelId?: string, externalId?: string) {
    if (channelId && externalId) {
      const key = `${channelId}:${externalId}`
      const pending = pendingThreads.get(key)
      if (pending && pending.threadId === threadId) {
        pendingThreads.delete(key)
        return { thread: { id: threadId, metadata: pending.metadata }, resource: RESOURCE_ID }
      }
    }
    return { thread: threadId, resource: RESOURCE_ID }
  }

  return {
    env,

    async generate({ threadId, parts, channelId, externalId }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.generate(buildMessages(parts), {
        memory: memoryOption(threadId, channelId, externalId),
      })
      return buildResult(result)
    },

    async stream({ threadId, parts, channelId, externalId }) {
      const agent = mastra.getAgent('operator')
      const output = await agent.stream(buildMessages(parts), {
        memory: memoryOption(threadId, channelId, externalId),
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

    async streamAISdk({ threadId, parts, isNewThread }) {
      // Build memory option: for new threads pass metadata so Mastra creates with root: true
      const memory = isNewThread
        ? { thread: { id: threadId, metadata: { root: true } }, resource: RESOURCE_ID }
        : { thread: threadId, resource: RESOURCE_ID }

      const agent = mastra.getAgent('operator')
      const output = await agent.stream(buildMessages(parts), { memory })

      return toAISdkStream(output, {
        from: 'agent',
        sendReasoning: true,
        sendSources: true,
      }).pipeThrough(createApprovalTransform())
    },

    async approveToolCallAISdk({ runId, toolCallId, threadId, messageId }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.approveToolCall({
        runId,
        ...(toolCallId && { toolCallId }),
        memory: { thread: threadId, resource: RESOURCE_ID },
      })

      return toAISdkStream(result, {
        from: 'agent',
        lastMessageId: messageId,
        sendReasoning: true,
        sendSources: true,
      }).pipeThrough(createApprovalTransform())
    },

    async declineToolCallAISdk({ runId, toolCallId, threadId, messageId }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.declineToolCall({
        runId,
        ...(toolCallId && { toolCallId }),
        memory: { thread: threadId, resource: RESOURCE_ID },
      })

      return toAISdkStream(result, {
        from: 'agent',
        lastMessageId: messageId,
        sendReasoning: true,
        sendSources: true,
      }).pipeThrough(createApprovalTransform())
    },

    async resolveThread(channelId, externalId) {
      const key = `${channelId}:${externalId}`

      // Check if there's a pending thread (created via newThread but not yet
      // persisted via generate/stream).
      const pending = pendingThreads.get(key)
      if (pending) {
        return pending.threadId
      }

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
      const key = `${channelId}:${externalId}`
      // Don't create the thread in the DB yet — stash metadata so Mastra
      // creates it (with generateTitle) when generate/stream is called.
      pendingThreads.set(key, {
        threadId,
        metadata: { channel: channelId, externalId, root: true },
      })
      return threadId
    },
  }
}
