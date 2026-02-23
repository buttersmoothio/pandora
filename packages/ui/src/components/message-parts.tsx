'use client'

import type { ChatAddToolApproveResponseFunction } from 'ai'
import { isToolUIPart, type UIMessage } from 'ai'
import { CheckIcon, XIcon } from 'lucide-react'
import { MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'

export function MessageParts({
  message,
  isLastMessage,
  isStreaming,
  onToolApproval,
}: {
  message: UIMessage
  isLastMessage: boolean
  isStreaming: boolean
  onToolApproval?: ChatAddToolApproveResponseFunction
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
        if (part.type.startsWith('data-')) return null
        if (part.type === 'text') {
          return <MessageResponse key={`${message.id}-${i}`}>{part.text}</MessageResponse>
        }

        if (isToolUIPart(part)) {
          const state = part.state
          const isAwaitingApproval = state === 'approval-requested'

          return (
            <Tool
              key={`${message.id}-${i}`}
              defaultOpen={isAwaitingApproval || state === 'output-available'}
            >
              {part.type === 'dynamic-tool' ? (
                <ToolHeader type={part.type} state={state} toolName={part.toolName} />
              ) : (
                <ToolHeader type={part.type} state={state} />
              )}
              <ToolContent>
                <ToolInput input={part.input as Record<string, unknown>} />
                {isAwaitingApproval && onToolApproval && part.approval != null && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        onToolApproval({
                          id: part.approval.id,
                          approved: true,
                        })
                      }
                    >
                      <CheckIcon className="size-3.5" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onToolApproval({
                          id: part.approval.id,
                          approved: false,
                        })
                      }
                    >
                      <XIcon className="size-3.5" />
                      Deny
                    </Button>
                  </div>
                )}
                {(state === 'output-available' || state === 'output-error') && (
                  <ToolOutput
                    output={part.output as string | undefined}
                    errorText={'errorText' in part ? (part.errorText as string) : undefined}
                  />
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
