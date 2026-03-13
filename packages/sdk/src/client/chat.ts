import type { FetchContext } from './fetch-wrapper'
import { fetchRaw } from './fetch-wrapper'

/** Input for {@link ChatClient.send}. */
export interface ChatSendInput {
  /** Message parts to send (AI SDK `MessagePart` format). */
  parts: unknown[]
  /** Thread ID to continue. Omit to start a new conversation. */
  threadId?: string
}

/** Input for {@link ChatClient.approve}. */
export interface ChatApproveInput {
  /** Run ID of the suspended generation. */
  runId: string
  /** Thread the tool call belongs to. */
  threadId: string
  /** ID of the specific tool call to approve or decline. */
  toolCallId: string
  /** `true` to approve, `false` to decline. */
  approved: boolean
  /** Message ID containing the tool call (for UI state updates). */
  messageId?: string
}

/**
 * Chat client — streaming message send, tool approval, and stream resume.
 *
 * Access via `client.chat`.
 *
 * All methods return a raw `Response` because the chat endpoints produce
 * SSE streams. Use AI SDK's `DefaultChatTransport` or parse the stream
 * directly.
 *
 * @example
 * ```ts
 * const response = await client.chat.send({
 *   parts: [{ type: 'text', text: 'Hello!' }],
 * })
 * const threadId = response.headers.get('X-Thread-Id')
 * ```
 */
export interface ChatClient {
  /**
   * Send a message and receive a streaming response.
   *
   * The response includes an `X-Thread-Id` header with the thread ID
   * (new or existing).
   *
   * @param input - Message parts and optional thread ID.
   * @returns Raw SSE stream `Response`.
   */
  send(input: ChatSendInput): Promise<Response>

  /**
   * Approve or decline a pending tool call and resume generation.
   * @param input - Approval details including run ID and tool call ID.
   * @returns Raw SSE stream `Response` with continued generation.
   */
  approve(input: ChatApproveInput): Promise<Response>

  /**
   * Resume an active stream for a thread (reconnection support).
   * @param threadId - Thread ID to resume.
   * @returns Raw SSE stream `Response`, or `null` if no active stream exists.
   */
  resume(threadId: string): Promise<Response | null>
}

/** @internal */
export function createChatClient(ctx: FetchContext): ChatClient {
  return {
    send(input: ChatSendInput): Promise<Response> {
      return fetchRaw(ctx, '/api/chat', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    approve(input: ChatApproveInput): Promise<Response> {
      return fetchRaw(ctx, '/api/chat/approve', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    async resume(threadId: string): Promise<Response | null> {
      const res = await fetchRaw(ctx, `/api/chat/${threadId}/stream`)
      if (res.status === 204) {
        return null
      }
      return res
    },
  }
}
