'use client'

import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai'
import { MessageSquareIcon, PencilIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { type BranchRef, MessageBranchNav } from '@/components/chat/branch-nav'
import { EditMessageForm } from '@/components/chat/edit-message-form'
import { InputAttachments } from '@/components/chat/input-attachments'
import { MessageParts } from '@/components/message-parts'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/use-config'
import { type ForkInfo, THREADS_KEY, useForkThread } from '@/hooks/use-threads'
import { apiFetch, getToken } from '@/lib/api'
import { convertServerMessages, type ServerMessage } from '@/lib/messages'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

export interface ThreadResponse {
  thread: {
    id: string
    title?: string
    createdAt: string
    updatedAt: string
  }
  messages: ServerMessage[]
  forks: Record<string, BranchRef[]>
  forkInfo: ForkInfo | null
}

export function ThreadChat({
  threadId,
  serverMessages,
  forks,
  forkInfo,
}: {
  threadId: string
  serverMessages: ServerMessage[]
  forks: Record<string, BranchRef[]>
  forkInfo: ForkInfo | null
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: config } = useConfig()
  const agentName = config?.identity.name ?? 'Pandora'
  const forkThread = useForkThread()

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const initialMessages = useMemo(() => convertServerMessages(serverMessages), [serverMessages])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/api/chat`,
        fetch: async (url, init) => {
          const res = await fetch(url, init)
          queryClient.invalidateQueries({ queryKey: THREADS_KEY })
          return res
        },
        headers: (): Record<string, string> => {
          const token = getToken()
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages.at(-1)

          // Route approval responses to the approval endpoint
          if (lastMessage?.role === 'assistant') {
            const approvalPart = lastMessage.parts.find(
              (p) => isToolUIPart(p) && p.state === 'approval-responded',
            )
            if (approvalPart && isToolUIPart(approvalPart)) {
              return {
                api: `${API_URL}/api/chat/approve`,
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
          return { body: { parts, threadId } }
        },
        prepareReconnectToStreamRequest: () => {
          const token = getToken()
          return token ? { headers: { Authorization: `Bearer ${token}` } } : {}
        },
      }),
    [threadId, queryClient],
  )

  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
    resume: true,
    sendAutomaticallyWhen: ({ messages: msgs }) => {
      const lastMessage = msgs.at(-1)
      if (lastMessage?.role !== 'assistant') return false
      return lastMessage.parts.some((p) => isToolUIPart(p) && p.state === 'approval-responded')
    },
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY })
    },
    onError: (err) => {
      toast.error(err.message || 'Stream failed')
    },
  })

  // Auto-send pending fork message once chat is ready
  const hasSentPending = useRef(false)
  useEffect(() => {
    if (hasSentPending.current || status !== 'ready') return
    const raw = sessionStorage.getItem('pendingForkMessage')
    if (!raw) return
    try {
      const { threadId: forkId, text } = JSON.parse(raw)
      if (forkId === threadId) {
        hasSentPending.current = true
        sessionStorage.removeItem('pendingForkMessage')
        sendMessage({ text })
      }
    } catch {
      sessionStorage.removeItem('pendingForkMessage')
    }
  }, [threadId, sendMessage, status])

  const isStreaming = status === 'streaming'

  const handleEdit = useCallback((message: UIMessage) => {
    const textPart = message.parts.find((p) => p.type === 'text')
    setEditingMessageId(message.id)
    setEditText(textPart?.text ?? '')
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditText('')
  }, [])

  const handleSubmitEdit = useCallback(
    async (clientMessageId: string) => {
      const text = editText.trim()
      if (!text) return
      setEditingMessageId(null)
      setEditText('')

      // useChat may assign client-generated IDs that differ from server IDs.
      // Resolve to the real server-side message ID by matching index position.
      let messageId = clientMessageId
      const msgIndex = messages.findIndex((m) => m.id === clientMessageId)
      if (msgIndex !== -1) {
        try {
          const fresh = await apiFetch<ThreadResponse>(`/api/threads/${threadId}`)
          const freshMessages = convertServerMessages(fresh.messages)
          if (freshMessages[msgIndex]) {
            messageId = freshMessages[msgIndex].id
          }
        } catch {
          // Fall back to client ID
        }
      }

      forkThread.mutate(
        { threadId, messageId },
        {
          onSuccess: ({ thread: forkedThread }) => {
            sessionStorage.setItem(
              'pendingForkMessage',
              JSON.stringify({ threadId: forkedThread.id, text }),
            )
            router.push(`/chat/${forkedThread.id}`)
          },
        },
      )
    },
    [editText, threadId, forkThread, router, messages],
  )

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
              description={`Send a message to begin chatting with ${agentName}.`}
            />
          ) : (
            messages.map((message, index) => (
              <Message from={message.role} key={message.id}>
                {message.role === 'user' && editingMessageId === message.id ? (
                  <EditMessageForm
                    text={editText}
                    onChange={setEditText}
                    onCancel={handleCancelEdit}
                    onSubmit={() => handleSubmitEdit(message.id)}
                  />
                ) : message.role === 'user' ? (
                  <div className="group/actions flex items-center gap-1 self-end">
                    <MessageBranchNav
                      message={message}
                      messageIndex={index}
                      forks={forks}
                      forkInfo={forkInfo}
                      threadId={threadId}
                    />
                    <MessageParts
                      message={message}
                      isLastMessage={index === messages.length - 1}
                      isStreaming={isStreaming}
                      onToolApproval={addToolApprovalResponse}
                    />
                    {!isStreaming && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(message)}
                        className="shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover/actions:opacity-100"
                      >
                        <PencilIcon className="size-3.5" />
                        <span className="sr-only">Edit message</span>
                      </Button>
                    )}
                  </div>
                ) : (
                  <MessageParts
                    message={message}
                    isLastMessage={index === messages.length - 1}
                    isStreaming={isStreaming}
                    onToolApproval={addToolApprovalResponse}
                  />
                )}
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        <PromptInput
          globalDrop
          multiple
          onSubmit={(msg) => sendMessage({ text: msg.text, files: msg.files })}
        >
          <PromptInputHeader>
            <InputAttachments />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Send a message..." />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
