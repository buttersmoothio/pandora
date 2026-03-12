import { toAISdkStream } from '@mastra/ai-sdk'
import type { Mastra } from '@mastra/core'
import type { MessagePart } from '@pandorakit/sdk/channels'
import type { ToolRecord } from '../tools/types'
import { buildMessages, createApprovalTransform } from './gateway-mappers'

const RESOURCE_ID = 'default'

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

interface WebGatewayDeps {
  mastra: Mastra
  interactiveTools?: ToolRecord
}

export function createWebGateway(deps: WebGatewayDeps): WebGateway {
  const { mastra, interactiveTools } = deps
  const interactiveToolset =
    interactiveTools && Object.keys(interactiveTools).length > 0
      ? { interactive: interactiveTools }
      : undefined

  return {
    async stream({ threadId, parts, isNewThread }) {
      const memory = isNewThread
        ? { thread: { id: threadId, metadata: { root: true } }, resource: RESOURCE_ID }
        : { thread: threadId, resource: RESOURCE_ID }

      const agent = mastra.getAgent('operator')
      const output = await agent.stream(buildMessages(parts), {
        memory,
        toolsets: interactiveToolset,
      })

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
}
