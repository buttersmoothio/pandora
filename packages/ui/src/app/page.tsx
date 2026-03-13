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
import { InputAttachments } from '@/components/chat/input-attachments'
import { MessageParts } from '@/components/message-parts'
import { useConfig } from '@/hooks/use-config'
import { THREADS_KEY } from '@/hooks/use-threads'
import { API_URL, getToken } from '@/lib/api'

export default function Home(): React.JSX.Element {
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
      prepareSendMessagesRequest: ({
        messages,
      }: {
        messages: { role: string; parts: unknown[] }[]
      }) => {
        const lastMessage = messages.at(-1)
        const parts = lastMessage?.role === 'user' ? lastMessage.parts : []
        return { body: { parts } }
      },
      fetch: async (url: string | URL | globalThis.Request, init: RequestInit | undefined) => {
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
    onError: (err: Error) => {
      toast.error(err.message || 'Stream failed')
    },
  })

  const isStreaming: boolean = status === 'streaming'

  return (
    <div className="flex h-full flex-1 flex-col">
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
        <PromptInput
          globalDrop
          multiple
          onSubmit={(msg: { text: string; files: import('ai').FileUIPart[] }): void => {
            sendMessage({ text: msg.text, files: msg.files })
          }}
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
