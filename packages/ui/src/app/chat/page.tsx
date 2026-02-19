'use client'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai'
import { MessageSquareIcon } from 'lucide-react'

function MessageParts({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: UIMessage
  isLastMessage: boolean
  isStreaming: boolean
}) {
  const reasoningParts = message.parts.filter((p) => p.type === 'reasoning')
  const reasoningText = reasoningParts.map((p) => p.text).join('\n\n')
  const hasReasoning = reasoningParts.length > 0
  const lastPart = message.parts.at(-1)
  const isReasoningStreaming =
    isLastMessage && isStreaming && lastPart?.type === 'reasoning'

  const sourceParts = message.parts.filter((p) => p.type === 'source-url')

  return (
    <>
      {hasReasoning && (
        <Reasoning isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      )}

      {sourceParts.length > 0 && (
        <Sources>
          <SourcesTrigger count={sourceParts.length} />
          <SourcesContent>
            {sourceParts.map((part, i) => (
              <Source
                key={`source-${i}`}
                href={part.url}
                title={part.title || part.url}
              />
            ))}
          </SourcesContent>
        </Sources>
      )}

      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <MessageResponse key={`${message.id}-${i}`}>
              {part.text}
            </MessageResponse>
          )
        }
        if (isToolUIPart(part)) {
          return (
            <Tool key={`${message.id}-${i}`} defaultOpen={part.state === 'output-available'}>
              <ToolHeader type={part.type} state={part.state} />
              <ToolContent>
                <ToolInput input={part.input} />
                {(part.state === 'output-available' || part.state === 'output-error') && (
                  <ToolOutput output={part.output} errorText={part.errorText} />
                )}
              </ToolContent>
            </Tool>
          )
        }
        return null
      })}
    </>
  )
}

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: process.env.NEXT_PUBLIC_API_URL
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/chat`
        : 'http://localhost:4111/api/chat',
    }),
  })

  const isStreaming = status === 'streaming'

  return (
    <div className="flex h-dvh flex-col">
      <Conversation className="relative flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
              description="Send a message to begin chatting with Pandora."
            />
          ) : (
            messages.map((message, index) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  <MessageParts
                    message={message}
                    isLastMessage={index === messages.length - 1}
                    isStreaming={isStreaming}
                  />
                </MessageContent>
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
