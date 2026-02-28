import { toAISdkStream } from '@mastra/ai-sdk'
import type { Mastra } from '@mastra/core'
import type { FullOutput } from '@mastra/core/stream'
import type { Memory } from '@mastra/memory'
import type { ChannelGateway, GenerateResult, MessagePart, StreamResult } from '../channels/types'
import { getLogger } from '../logger'

const RESOURCE_ID = 'default'

function buildMessages(parts: MessagePart[]) {
  return [{ id: crypto.randomUUID(), role: 'user' as const, parts }]
}

async function getMemory(mastra: Mastra): Promise<Memory> {
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) throw new Error('Memory not configured')
  return memory as Memory
}

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

function createApprovalTransform(): TransformStream {
  const log = getLogger()
  return new TransformStream({
    // biome-ignore lint/suspicious/noExplicitAny: stream chunks are untyped
    transform(chunk: any, controller) {
      try {
        if (chunk.type === 'data-tool-call-approval') {
          log.info('[ApprovalTransform] data-tool-call-approval → tool-approval-request', {
            runId: chunk.data?.runId,
            toolCallId: chunk.data?.toolCallId,
          })
          controller.enqueue({
            type: 'tool-approval-request',
            approvalId: chunk.data?.runId,
            toolCallId: chunk.data?.toolCallId,
          })
          return
        }
        if (chunk.type === 'data-tool-call-suspended') {
          log.info('[ApprovalTransform] suppressing data-tool-call-suspended')
          return
        }
        controller.enqueue(chunk)
      } catch (err) {
        log.error('[ApprovalTransform] failed to transform chunk', {
          type: chunk?.type,
          error: err instanceof Error ? err.message : String(err),
        })
        controller.enqueue(chunk)
      }
    },
  })
}

// -- Web Gateway --

export interface WebGateway {
  stream(opts: {
    threadId: string
    parts: MessagePart[]
    isNewThread?: boolean
  }): Promise<ReadableStream>

  approveToolCall(opts: {
    runId: string
    toolCallId?: string
    threadId: string
    messageId?: string
  }): Promise<ReadableStream>

  declineToolCall(opts: {
    runId: string
    toolCallId?: string
    threadId: string
    messageId?: string
  }): Promise<ReadableStream>
}

// -- Channel Gateway --

// Re-exported from types — ChannelGateway is the public interface for channel adapters

interface GatewayDeps {
  mastra: Mastra
  env: Record<string, string | undefined>
}

interface PendingThread {
  threadId: string
  metadata: Record<string, unknown>
}

export function createGateways(deps: GatewayDeps): {
  channel: (channelId?: string) => ChannelGateway
  web: WebGateway
} {
  const { mastra, env } = deps

  // Shared pending threads state
  const pendingThreads = new Map<string, PendingThread>()

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

  const channel = (channelId?: string): ChannelGateway => ({
    env,

    async generate({ threadId, parts, channelId: chId, externalId }) {
      const agent = mastra.getAgent('operator')
      const result = await agent.generate(buildMessages(parts), {
        memory: memoryOption(threadId, chId, externalId),
      })
      return buildResult(result)
    },

    async stream({ threadId, parts, channelId: chId, externalId }) {
      const agent = mastra.getAgent('operator')
      const output = await agent.stream(buildMessages(parts), {
        memory: memoryOption(threadId, chId, externalId),
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

    async resolveThread(chId, externalId) {
      const key = `${chId}:${externalId}`
      const pending = pendingThreads.get(key)
      if (pending) return pending.threadId

      const memory = await getMemory(mastra)
      const result = await memory.listThreads({
        filter: {
          resourceId: RESOURCE_ID,
          metadata: { channel: chId, externalId },
        },
        orderBy: { field: 'updatedAt', direction: 'DESC' },
        perPage: 1,
      })

      if (result.threads.length > 0) return result.threads[0].id

      return this.newThread(chId, externalId)
    },

    newThread(chId, externalId) {
      const threadId = crypto.randomUUID()
      const key = `${chId}:${externalId}`
      pendingThreads.set(key, {
        threadId,
        metadata: { channel: chId, externalId, root: true },
      })
      return threadId
    },
  })

  const web: WebGateway = {
    async stream({ threadId, parts, isNewThread }) {
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

    async approveToolCall({ runId, toolCallId, threadId, messageId }) {
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

    async declineToolCall({ runId, toolCallId, threadId, messageId }) {
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
  }

  return { channel, web }
}
