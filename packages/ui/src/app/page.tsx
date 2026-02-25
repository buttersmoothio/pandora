'use client'

import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import { MessageSquareIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
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
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import { MessageParts } from '@/components/message-parts'
import { useConfig } from '@/hooks/use-config'
import { THREADS_KEY } from '@/hooks/use-threads'
import { getToken } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

export default function Home() {
  const { data: config } = useConfig()
  const agentName = config?.identity.name ?? 'Pandora'
  const router = useRouter()
  const queryClient = useQueryClient()
  const threadIdRef = useRef<string | null>(null)

  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_URL}/api/chat`,
      headers: (): Record<string, string> => {
        const token = getToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
      },
      prepareSendMessagesRequest: ({ messages }) => {
        const lastMessage = messages.at(-1)
        const parts = lastMessage?.role === 'user' ? lastMessage.parts : []
        return { body: { parts } }
      },
      fetch: async (url, init) => {
        const res = await fetch(url, init)
        const threadId = res.headers.get('X-Thread-Id')
        if (threadId) {
          threadIdRef.current = threadId
          queryClient.invalidateQueries({ queryKey: THREADS_KEY })
        }
        return res
      },
    }),
    onFinish: () => {
      if (threadIdRef.current) {
        const id = threadIdRef.current
        threadIdRef.current = null
        queryClient.invalidateQueries({ queryKey: THREADS_KEY })
        router.push(`/chat/${id}`)
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Stream failed')
    },
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
                  onToolApproval={addToolApprovalResponse}
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
