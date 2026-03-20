'use client'

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
import { useChat } from '@/hooks/use-chat'
import { useConfig } from '@/hooks/use-config'

export default function Home(): React.JSX.Element {
  const { data: config } = useConfig()
  const agentName = config?.identity.name ?? 'Pandora'
  const router = useRouter()
  const threadIdRef = useRef<string | null>(null)

  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    onThreadCreated: (id) => {
      threadIdRef.current = id
    },
    onFinish: () => {
      if (threadIdRef.current) {
        const id = threadIdRef.current
        threadIdRef.current = null
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
