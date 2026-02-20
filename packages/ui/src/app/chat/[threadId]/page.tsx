'use client'

import { useChat } from '@ai-sdk/react'
import { useQuery } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { LoaderIcon, MessageSquareIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'
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
import { useConfig } from '@/hooks/use-config'
import { apiFetch, getToken } from '@/lib/api'
import { convertMastraMessages, type MastraDBMessage } from '@/lib/messages'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

interface ThreadResponse {
  thread: {
    id: string
    title?: string
    createdAt: string
    updatedAt: string
  }
  messages: MastraDBMessage[]
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

  return <ThreadChat threadId={threadId} serverMessages={data.messages} />
}

function ThreadChat({
  threadId,
  serverMessages,
}: {
  threadId: string
  serverMessages: MastraDBMessage[]
}) {
  const { data: config } = useConfig()
  const agentName = config?.identity.name ?? 'Pandora'

  const initialMessages = useMemo(() => convertMastraMessages(serverMessages), [serverMessages])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/api/chat`,
        headers: (): Record<string, string> => {
          const token = getToken()
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages.at(-1)
          const parts = lastMessage?.role === 'user' ? lastMessage.parts : []
          return { body: { parts, threadId } }
        },
        prepareReconnectToStreamRequest: () => {
          const token = getToken()
          return token ? { headers: { Authorization: `Bearer ${token}` } } : {}
        },
      }),
    [threadId],
  )

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
    resume: true,
  })

  const isStreaming = status === 'streaming'

  return (
    <div className="flex h-full flex-1 flex-col">
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
                <MessageParts
                  message={message}
                  isLastMessage={index === messages.length - 1}
                  isStreaming={isStreaming}
                />
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
