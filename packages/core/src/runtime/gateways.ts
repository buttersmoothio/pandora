import { toAISdkStream } from '@mastra/ai-sdk'
import type { Mastra } from '@mastra/core'
import type {
  FileChunk,
  FullOutput,
  LanguageModelUsage,
  ReasoningChunk,
  SourceChunk,
  ToolCallChunk,
  ToolResultChunk,
} from '@mastra/core/stream'
import type { Memory } from '@mastra/memory'
import type {
  ChannelGateway,
  FileData,
  GenerateResult,
  MessagePart,
  Reasoning,
  Source,
  StreamResult,
  ToolCall,
  ToolResult,
  Usage,
} from '@pandorakit/sdk/channels'
import { getLogger } from '../logger'

const RESOURCE_ID = 'default'

// biome-ignore lint/suspicious/noExplicitAny: SDK MessagePart is a structural subset of Mastra's
function buildMessages(parts: MessagePart[]): any[] {
  return [{ id: crypto.randomUUID(), role: 'user' as const, parts }]
}

async function getMemory(mastra: Mastra): Promise<Memory> {
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) throw new Error('Memory not configured')
  return memory as Memory
}

// ---------------------------------------------------------------------------
// Mastra → SDK type mappers
// ---------------------------------------------------------------------------

function mapSource(chunk: SourceChunk): Source {
  return {
    id: chunk.payload.id,
    sourceType: chunk.payload.sourceType,
    title: chunk.payload.title,
    url: chunk.payload.url,
    mimeType: chunk.payload.mimeType,
    filename: chunk.payload.filename,
  }
}

function mapToolCall(chunk: ToolCallChunk): ToolCall {
  return {
    toolCallId: chunk.payload.toolCallId,
    toolName: chunk.payload.toolName,
    args: chunk.payload.args,
  }
}

function mapToolResult(chunk: ToolResultChunk): ToolResult {
  return {
    toolCallId: chunk.payload.toolCallId,
    toolName: chunk.payload.toolName,
    result: chunk.payload.result,
    isError: chunk.payload.isError,
  }
}

function mapFile(chunk: FileChunk): FileData {
  return {
    data: chunk.payload.data,
    mimeType: chunk.payload.mimeType,
  }
}

function mapReasoning(chunk: ReasoningChunk): Reasoning {
  return {
    id: chunk.payload.id,
    text: chunk.payload.text,
  }
}

function mapUsage(usage: LanguageModelUsage): Usage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
  }
}

function buildResult(result: FullOutput): GenerateResult {
  return {
    text: result.text,
    sources: result.sources.map(mapSource),
    toolCalls: result.toolCalls.map(mapToolCall),
    toolResults: result.toolResults.map(mapToolResult),
    files: result.files.map(mapFile),
    reasoning: result.reasoning.map(mapReasoning),
    reasoningText: result.reasoningText ?? undefined,
    usage: mapUsage(result.usage),
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

  const mastraLogger = getLogger(env)
  const logger = {
    log: (...args: unknown[]) => mastraLogger.info(String(args[0]), ...args.slice(1)),
    warn: (...args: unknown[]) => mastraLogger.warn(String(args[0]), ...args.slice(1)),
    error: (...args: unknown[]) => mastraLogger.error(String(args[0]), ...args.slice(1)),
  }

  const channel = (_channelId?: string): ChannelGateway => ({
    env,
    logger,

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
        sources: output.sources.then((s) => s.map(mapSource)),
        toolCalls: output.toolCalls.then((t) => t.map(mapToolCall)),
        toolResults: output.toolResults.then((t) => t.map(mapToolResult)),
        files: output.files.then((f) => f.map(mapFile)),
        reasoning: output.reasoning.then((r) => r.map(mapReasoning)),
        reasoningText: output.reasoningText,
        usage: output.usage.then(mapUsage),
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
