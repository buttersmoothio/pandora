import type { Mastra } from '@mastra/core'
import type {
  ChannelGateway,
  GenerateResult,
  MessagePart,
  StreamResult,
} from '@pandorakit/sdk/channels'
import { getLogger } from '../logger'
import type { ToolRecord } from '../tools/types'
import {
  buildMessages,
  buildResult,
  getMemory,
  mapFile,
  mapReasoning,
  mapSource,
  mapToolCall,
  mapToolResult,
  mapUsage,
} from './gateway-mappers'

const RESOURCE_ID = 'default'

interface ChannelGatewayDeps {
  mastra: Mastra
  env: Record<string, string | undefined>
  interactiveTools?: ToolRecord
}

interface PendingThread {
  threadId: string
  metadata: Record<string, unknown>
}

/**
 * Create a channel gateway factory. Returned instances share
 * pending-thread state needed for resolveThread / newThread.
 */
export function createChannelGateway(
  deps: ChannelGatewayDeps,
): (channelId?: string) => ChannelGateway {
  const { mastra, env, interactiveTools } = deps
  const interactiveToolset =
    interactiveTools && Object.keys(interactiveTools).length > 0
      ? { interactive: interactiveTools }
      : undefined

  const pendingThreads = new Map<string, PendingThread>()
  const resolveLocks = new Map<string, Promise<string>>()

  const mastraLogger = getLogger(env)
  const logger: ChannelGateway['logger'] = {
    log: (...args: unknown[]): void => mastraLogger.info(String(args[0]), ...args.slice(1)),
    warn: (...args: unknown[]): void => mastraLogger.warn(String(args[0]), ...args.slice(1)),
    error: (...args: unknown[]): void => mastraLogger.error(String(args[0]), ...args.slice(1)),
  }

  function memoryOption(
    threadId: string,
    channelId?: string,
    externalId?: string,
  ): { thread: string | { id: string; metadata: Record<string, unknown> }; resource: string } {
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

  return (_channelId?: string): ChannelGateway => ({
    env,
    logger,

    async generate({
      threadId,
      parts,
      channelId: chId,
      externalId,
    }: {
      threadId: string
      parts: MessagePart[]
      channelId?: string
      externalId?: string
    }): Promise<GenerateResult> {
      const agent = mastra.getAgent('operator')
      const result = await agent.generate(buildMessages(parts), {
        memory: memoryOption(threadId, chId, externalId),
        toolsets: interactiveToolset,
      })
      return buildResult(result)
    },

    async stream({
      threadId,
      parts,
      channelId: chId,
      externalId,
    }: {
      threadId: string
      parts: MessagePart[]
      channelId?: string
      externalId?: string
    }): Promise<StreamResult> {
      const agent = mastra.getAgent('operator')
      const output = await agent.stream(buildMessages(parts), {
        memory: memoryOption(threadId, chId, externalId),
        toolsets: interactiveToolset,
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

    async approveToolCall({
      runId,
      toolCallId,
    }: {
      runId: string
      toolCallId?: string
    }): Promise<GenerateResult> {
      const agent = mastra.getAgent('operator')
      const result = await agent.approveToolCallGenerate({ runId, toolCallId })
      return buildResult(result)
    },

    async declineToolCall({
      runId,
      toolCallId,
    }: {
      runId: string
      toolCallId?: string
    }): Promise<GenerateResult> {
      const agent = mastra.getAgent('operator')
      const result = await agent.declineToolCallGenerate({ runId, toolCallId })
      return buildResult(result)
    },

    async resolveThread(chId: string, externalId: string): Promise<string> {
      const key = `${chId}:${externalId}`
      const pending = pendingThreads.get(key)
      if (pending) {
        return pending.threadId
      }

      const existing = resolveLocks.get(key)
      if (existing) {
        return existing
      }

      const promise = (async () => {
        const memory = await getMemory(mastra)
        const result = await memory.listThreads({
          filter: {
            resourceId: RESOURCE_ID,
            metadata: { channel: chId, externalId },
          },
          orderBy: { field: 'updatedAt', direction: 'DESC' },
          perPage: 1,
        })

        if (result.threads.length > 0) {
          return result.threads[0].id
        }

        return this.newThread(chId, externalId)
      })()

      resolveLocks.set(key, promise)
      try {
        return await promise
      } finally {
        resolveLocks.delete(key)
      }
    },

    newThread(chId: string, externalId: string): string {
      const threadId = crypto.randomUUID()
      const key = `${chId}:${externalId}`
      pendingThreads.set(key, {
        threadId,
        metadata: { channel: chId, externalId, root: true },
      })
      return threadId
    },
  })
}
