'use client'

import type { ForkInfo, ServerMessage } from '@pandorakit/sdk/client'
import type { UIMessage } from 'ai'
import { MessageSquareIcon, PencilIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useCallback, useState } from 'react'
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
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { type BranchRef, MessageBranchNav } from '@/components/chat/branch-nav'
import { EditMessageForm } from '@/components/chat/edit-message-form'
import { InputAttachments } from '@/components/chat/input-attachments'
import { MessageParts } from '@/components/message-parts'
import { Button } from '@/components/ui/button'
import { useChat } from '@/hooks/use-chat'
import { useConfig } from '@/hooks/use-config'

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
}): React.JSX.Element {
  const router = useRouter()
  const { data: config } = useConfig()
  const agentName = config?.identity.name ?? 'Pandora'

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const { messages, sendMessage, status, addToolApprovalResponse, editMessage } = useChat({
    threadId,
    initialMessages: serverMessages,
    onError: (err: Error): void => {
      toast.error(err.message || 'Stream failed')
    },
  })

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
      if (!text) {
        return
      }
      setEditingMessageId(null)
      setEditText('')

      try {
        const newThreadId = await editMessage(clientMessageId, text)
        router.push(`/chat/${newThreadId}`)
      } catch {
        // Fork failed
      }
    },
    [editText, editMessage, router],
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
                    onSubmit={(): void => {
                      handleSubmitEdit(message.id)
                    }}
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
                        onClick={(): void => handleEdit(message)}
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
          onSubmit={(msg: PromptInputMessage): void => {
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
