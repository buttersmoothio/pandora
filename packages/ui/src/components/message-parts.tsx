'use client'

import { isToolUIPart, type UIMessage } from 'ai'
import { MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'

export function MessageParts({
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
  const isReasoningStreaming = isLastMessage && isStreaming && lastPart?.type === 'reasoning'

  const sourceParts = message.parts.filter((p) => p.type === 'source-url')

  return (
    <MessageContent>
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
            {sourceParts.map((part) => (
              <Source key={part.url} href={part.url} title={part.title || part.url} />
            ))}
          </SourcesContent>
        </Sources>
      )}

      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return <MessageResponse key={`${message.id}-${i}`}>{part.text}</MessageResponse>
        }
        if (isToolUIPart(part)) {
          const toolHeaderProps =
            part.type === 'dynamic-tool'
              ? { type: part.type, state: part.state, toolName: part.toolName }
              : { type: part.type, state: part.state }
          return (
            <Tool key={`${message.id}-${i}`} defaultOpen={part.state === 'output-available'}>
              <ToolHeader {...toolHeaderProps} />
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
    </MessageContent>
  )
}
