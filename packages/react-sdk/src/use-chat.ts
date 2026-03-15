'use client'

import { useChat as useAiChat } from '@ai-sdk/react'
import type { ServerMessage, ThreadDetailResponse } from '@pandorakit/sdk/client'
import { useQueryClient } from '@tanstack/react-query'
import type { ChatAddToolApproveResponseFunction, ChatStatus, FileUIPart, UIMessage } from 'ai'
import { isToolUIPart } from 'ai'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { convertServerMessages } from './convert-server-messages'
import { createPandoraTransport } from './create-pandora-transport'
import { threadsKey } from './keys'
import { usePandoraClient, usePandoraContext } from './provider'

const PENDING_FORK_KEY = 'pendingForkMessage'

export interface UseChatOptions {
  /** Thread ID for an existing conversation. Omit to start a new chat. */
  threadId?: string
  /** Initial messages (e.g. loaded from server). Converted to UIMessage internally. */
  initialMessages?: ServerMessage[]
  /** Called when a new thread is created (new-chat flow). Receives the thread ID. */
  onThreadCreated?: (threadId: string) => void
  /** Called when the assistant response stream finishes. */
  onFinish?: () => void
  /** Called when a streaming error occurs. */
  onError?: (error: Error) => void
}

export interface UseChatReturn {
  /** Current chat messages. */
  messages: UIMessage[]
  /** Send a new user message. */
  sendMessage: (message: { text: string; files?: FileUIPart[] }) => Promise<void>
  /** Current chat status. */
  status: ChatStatus
  /** Respond to a tool approval request. */
  addToolApprovalResponse: ChatAddToolApproveResponseFunction
  /** Stop the current streaming response. */
  stop: () => Promise<void>
  /** Update messages locally. */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void
  /** Current error, if any. */
  error: Error | undefined
  /**
   * Edit a message by forking the thread at that point.
   * Returns the new thread ID (consumer handles navigation).
   * Only available when `threadId` is provided.
   */
  editMessage: (messageId: string, newText: string) => Promise<string>
}

/**
 * Chat hook for Pandora conversations with streaming, tool approvals, and message editing.
 *
 * - Omit `threadId` to start a new chat (use `onThreadCreated` to get the ID).
 * - Pass `threadId` and `initialMessages` to resume an existing thread.
 * - Use `editMessage` to fork a thread at a specific message for editing.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, status } = useChat({
 *   threadId: 'thread-123',
 *   initialMessages: serverMessages,
 *   onError: (err) => console.error(err),
 * })
 * ```
 */
export function useChat(options?: UseChatOptions): UseChatReturn {
  const {
    threadId,
    initialMessages: rawInitialMessages,
    onThreadCreated,
    onFinish,
    onError,
  } = options ?? {}

  const { baseUrl, getToken } = usePandoraContext()
  const client = usePandoraClient()
  const queryClient = useQueryClient()

  // Ref for thread ID in new-chat flow (set from X-Thread-Id header)
  const threadIdRef = useRef<string | null>(null)

  const invalidateThreads = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: threadsKey })
  }, [queryClient])

  const transport = useMemo(
    () =>
      createPandoraTransport({
        baseUrl,
        getToken,
        threadId,
        onThreadId: (id: string) => {
          threadIdRef.current = id
          invalidateThreads()
          onThreadCreated?.(id)
        },
        onResponse: invalidateThreads,
      }),
    [baseUrl, getToken, threadId, invalidateThreads, onThreadCreated],
  )

  const convertedInitialMessages = useMemo(
    () => (rawInitialMessages ? convertServerMessages(rawInitialMessages) : undefined),
    [rawInitialMessages],
  )

  const chat = useAiChat({
    id: threadId,
    transport,
    messages: convertedInitialMessages,
    resume: !!threadId,
    sendAutomaticallyWhen: ({ messages: msgs }: { messages: UIMessage[] }): boolean => {
      const lastMessage = msgs.at(-1)
      if (lastMessage?.role !== 'assistant') {
        return false
      }
      return lastMessage.parts.some((p) => isToolUIPart(p) && p.state === 'approval-responded')
    },
    onFinish: () => {
      invalidateThreads()
      onFinish?.()
    },
    onError,
  })

  // Auto-send pending fork message once chat is ready
  const hasSentPending = useRef(false)
  useEffect(() => {
    if (!threadId || hasSentPending.current || chat.status !== 'ready') {
      return
    }
    const raw = sessionStorage.getItem(PENDING_FORK_KEY)
    if (!raw) {
      return
    }
    try {
      const { threadId: forkId, text } = JSON.parse(raw)
      if (forkId === threadId) {
        hasSentPending.current = true
        sessionStorage.removeItem(PENDING_FORK_KEY)
        chat.sendMessage({ text })
      }
    } catch {
      sessionStorage.removeItem(PENDING_FORK_KEY)
    }
  }, [threadId, chat.sendMessage, chat.status])

  const editMessage = useCallback(
    async (clientMessageId: string, newText: string): Promise<string> => {
      if (!threadId) {
        throw new Error('editMessage requires a threadId')
      }

      // Resolve client message ID → server message ID.
      // useChat may assign client-generated IDs that differ from server IDs,
      // so we match by index position in the message list.
      let messageId = clientMessageId
      const msgIndex = chat.messages.findIndex((m) => m.id === clientMessageId)
      if (msgIndex !== -1) {
        try {
          const fresh = (await client.threads.get(threadId)) as ThreadDetailResponse
          const freshMessages = convertServerMessages(fresh.messages)
          if (freshMessages[msgIndex]) {
            messageId = freshMessages[msgIndex].id
          }
        } catch {
          // Fall back to client ID
        }
      }

      const { thread: forkedThread } = await client.threads.fork(threadId, messageId)
      invalidateThreads()

      sessionStorage.setItem(
        PENDING_FORK_KEY,
        JSON.stringify({ threadId: forkedThread.id, text: newText }),
      )

      return forkedThread.id
    },
    [threadId, chat.messages, client.threads, invalidateThreads],
  )

  return {
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    status: chat.status,
    addToolApprovalResponse: chat.addToolApprovalResponse,
    stop: chat.stop,
    setMessages: chat.setMessages,
    error: chat.error,
    editMessage,
  }
}
