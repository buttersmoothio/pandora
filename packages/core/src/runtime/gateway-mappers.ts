import type { Mastra } from '@mastra/core'
import type { MastraMemory } from '@mastra/core/memory'
import type {
  FileChunk,
  FullOutput,
  LanguageModelUsage,
  ReasoningChunk,
  SourceChunk,
  ToolCallChunk,
  ToolResultChunk,
} from '@mastra/core/stream'
import type {
  FileData,
  GenerateResult,
  MessagePart,
  Reasoning,
  Source,
  ToolCall,
  ToolResult,
  Usage,
} from '@pandorakit/sdk/channels'
import { getLogger } from '../logger'

// ---------------------------------------------------------------------------
// Message construction
// ---------------------------------------------------------------------------

interface ChannelFilePart {
  type: 'file'
  data: string | ArrayBuffer | Uint8Array
  mimeType: string
  filename?: string
}

function isChannelFilePart(part: MessagePart): part is MessagePart & ChannelFilePart {
  return part.type === 'file' && 'data' in part && 'mimeType' in part && !('url' in part)
}

/**
 * Normalize parts so both web UI (FileUIPart with url) and channel adapters
 * (FilePart with binary data) produce a consistent format for the agent.
 */
function normalizePart(part: MessagePart): unknown {
  // Channel format: { type: 'file', data, mimeType } — convert binary to data: URL
  if (isChannelFilePart(part)) {
    const raw = part.data
    const base64 =
      raw instanceof Uint8Array
        ? Buffer.from(raw).toString('base64')
        : raw instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(raw)).toString('base64')
          : Buffer.from(String(raw)).toString('base64')
    return {
      type: 'file',
      data: `data:${part.mimeType};base64,${base64}`,
      mimeType: part.mimeType,
      filename: part.filename,
    }
  }
  return part
}

// biome-ignore lint/suspicious/noExplicitAny: SDK MessagePart is a structural subset of Mastra's
export function buildMessages(parts: MessagePart[]): any[] {
  return [{ id: crypto.randomUUID(), role: 'user' as const, parts: parts.map(normalizePart) }]
}

export async function getMemory(mastra: Mastra): Promise<MastraMemory> {
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) {
    throw new Error('Memory not configured')
  }
  return memory
}

// ---------------------------------------------------------------------------
// Mastra → SDK type mappers
// ---------------------------------------------------------------------------

export function mapSource(chunk: SourceChunk): Source {
  return {
    id: chunk.payload.id,
    sourceType: chunk.payload.sourceType,
    title: chunk.payload.title,
    url: chunk.payload.url,
    mimeType: chunk.payload.mimeType,
    filename: chunk.payload.filename,
  }
}

export function mapToolCall(chunk: ToolCallChunk): ToolCall {
  return {
    toolCallId: chunk.payload.toolCallId,
    toolName: chunk.payload.toolName,
    args: chunk.payload.args,
  }
}

export function mapToolResult(chunk: ToolResultChunk): ToolResult {
  return {
    toolCallId: chunk.payload.toolCallId,
    toolName: chunk.payload.toolName,
    result: chunk.payload.result,
    isError: chunk.payload.isError,
  }
}

export function mapFile(chunk: FileChunk): FileData {
  return {
    data: chunk.payload.data,
    mimeType: chunk.payload.mimeType,
  }
}

export function mapReasoning(chunk: ReasoningChunk): Reasoning {
  return {
    id: chunk.payload.id,
    text: chunk.payload.text,
  }
}

export function mapUsage(usage: LanguageModelUsage): Usage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
  }
}

export function buildResult(result: FullOutput): GenerateResult {
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

// ---------------------------------------------------------------------------
// Stream transforms
// ---------------------------------------------------------------------------

interface StreamChunk {
  type: string
  data?: { runId?: string; toolCallId?: string }
  [key: string]: unknown
}

export function createApprovalTransform(): TransformStream {
  const log = getLogger()
  return new TransformStream({
    transform(chunk: StreamChunk, controller: TransformStreamDefaultController): void {
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
