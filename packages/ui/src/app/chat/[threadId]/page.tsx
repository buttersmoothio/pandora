'use client'

import { useChat } from '@ai-sdk/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderIcon,
  MessageSquareIcon,
  PencilIcon,
  XIcon,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import { MessageParts } from '@/components/message-parts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfig } from '@/hooks/use-config'
import { type ForkInfo, THREADS_KEY, useForkThread } from '@/hooks/use-threads'
import { apiFetch, getToken } from '@/lib/api'
import { convertServerMessages, type ServerMessage } from '@/lib/messages'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

type BranchRef = { id: string; title?: string }

interface ThreadResponse {
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

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => apiFetch<ThreadResponse>(`/api/threads/${threadId}`),
  })

  if (isLoading || !data) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ThreadChat
      threadId={threadId}
      serverMessages={data.messages}
      forks={data.forks}
      forkInfo={data.forkInfo}
    />
  )
}

function ThreadChat({
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
      <Conversation className="relative flex-1">
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
        <PromptInput onSubmit={(msg) => sendMessage({ text: msg.text })}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Send a message..." />
          </PromptInputBody>
          <PromptInputFooter>
            <div />
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

function EditMessageForm({
  text,
  onChange,
  onCancel,
  onSubmit,
}: {
  text: string
  onChange: (text: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[80px] resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
          if (e.key === 'Escape') onCancel()
        }}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <XIcon className="size-3.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!text.trim()}>
          <CheckIcon className="size-3.5" />
          Send
        </Button>
      </div>
    </div>
  )
}

function MessageBranchNav({
  message,
  messageIndex,
  forks,
  forkInfo,
  threadId,
}: {
  message: UIMessage
  messageIndex: number
  forks: Record<string, BranchRef[]>
  forkInfo: ForkInfo | null
  threadId: string
}) {
  const router = useRouter()

  // Case 1: This thread is the SOURCE — forks[message.id] lists child forks
  const messageForks = forks[message.id]

  // Case 2: This thread is a FORK — forkInfo tells us the fork point + siblings
  const isForkPoint = forkInfo && messageIndex === forkInfo.forkPointIndex

  const branches = useMemo(() => {
    if (messageForks?.length) {
      return [
        { id: threadId, label: 'current' },
        ...messageForks.map((f) => ({ id: f.id, label: f.title ?? f.id.slice(0, 8) })),
      ]
    }
    if (isForkPoint && forkInfo) {
      return [
        { id: forkInfo.sourceThreadId, label: 'original' },
        ...forkInfo.siblings.map((s) => ({ id: s.id, label: s.title ?? s.id.slice(0, 8) })),
        { id: threadId, label: 'current' },
      ]
    }
    return null
  }, [messageForks, isForkPoint, forkInfo, threadId])

  if (!branches) return null

  return (
    <BranchSelector
      branches={branches}
      currentId={threadId}
      onNavigate={(id) => router.push(`/chat/${id}`)}
    />
  )
}

function BranchSelector({
  branches,
  currentId,
  onNavigate,
}: {
  branches: { id: string; label: string }[]
  currentId: string
  onNavigate: (id: string) => void
}) {
  const currentIndex = branches.findIndex((b) => b.id === currentId)
  const idx = currentIndex === -1 ? 0 : currentIndex

  if (branches.length <= 1) return null

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          const prev = idx > 0 ? idx - 1 : branches.length - 1
          onNavigate(branches[prev].id)
        }}
      >
        <ChevronLeftIcon className="size-3.5" />
      </Button>
      <span className="tabular-nums">
        {idx + 1} / {branches.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          const next = idx < branches.length - 1 ? idx + 1 : 0
          onNavigate(branches[next].id)
        }}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
    </div>
  )
}
