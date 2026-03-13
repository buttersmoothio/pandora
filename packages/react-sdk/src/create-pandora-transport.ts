import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai'

export interface CreatePandoraTransportOptions {
  /** Base URL of the Pandora server (e.g. "http://localhost:4111"). */
  baseUrl: string
  /** Function that returns the current auth token, or null. */
  getToken: () => string | null
  /** Thread ID for existing conversations. Omit for new chats. */
  threadId?: string
  /** Called when a new thread ID is received from the server. */
  onThreadId?: (threadId: string) => void
  /** Called after each request completes. */
  onResponse?: () => void
}

/**
 * Create a pre-configured chat transport for Pandora.
 *
 * Handles auth headers, tool-approval routing, thread ID extraction,
 * and stream reconnection. Used internally by {@link useChat}.
 */
export function createPandoraTransport(
  options: CreatePandoraTransportOptions,
): DefaultChatTransport<UIMessage> {
  const { baseUrl, getToken, threadId, onThreadId, onResponse } = options

  return new DefaultChatTransport({
    api: `${baseUrl}/api/chat`,

    headers: (): Record<string, string> => {
      const token = getToken()
      return token ? { Authorization: `Bearer ${token}` } : {}
    },

    fetch: async (
      url: string | URL | globalThis.Request,
      init: RequestInit | undefined,
    ): Promise<Response> => {
      const res = await fetch(url, init)
      const newThreadId = res.headers.get('X-Thread-Id')
      if (newThreadId) {
        onThreadId?.(newThreadId)
      }
      onResponse?.()
      return res
    },

    prepareSendMessagesRequest: ({ messages }: { messages: UIMessage[] }) => {
      const lastMessage = messages.at(-1)

      // Route approval responses to the approval endpoint
      if (lastMessage?.role === 'assistant') {
        const approvalPart = lastMessage.parts.find(
          (p) => isToolUIPart(p) && p.state === 'approval-responded',
        )
        if (approvalPart && isToolUIPart(approvalPart)) {
          return {
            api: `${baseUrl}/api/chat/approve`,
            body: {
              runId: approvalPart.approval.id,
              toolCallId: approvalPart.toolCallId,
              approved: approvalPart.approval.approved,
              threadId,
              messageId: lastMessage.id,
            },
          }
        }
      }

      const parts = lastMessage?.role === 'user' ? lastMessage.parts : []
      return threadId ? { body: { parts, threadId } } : { body: { parts } }
    },

    prepareReconnectToStreamRequest: () => {
      const token = getToken()
      return token ? { headers: { Authorization: `Bearer ${token}` } } : {}
    },
  })
}
