'use client'

import type { ChatAddToolApproveResponseFunction } from 'ai'
import { isToolUIPart, type UIMessage } from 'ai'
import { CheckIcon, XIcon } from 'lucide-react'
import { MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'

type ToolPart = Extract<UIMessage['parts'][number], { type: `tool-${string}` | 'dynamic-tool' }>
type TextPart = Extract<UIMessage['parts'][number], { type: 'text' }>
type PartGroup = { type: 'text'; part: TextPart } | { type: 'tools'; parts: ToolPart[] }

function groupParts(parts: UIMessage['parts']): PartGroup[] {
  const groups: PartGroup[] = []
  for (const part of parts) {
    if (part.type === 'text') {
      groups.push({ type: 'text', part })
    } else if (isToolUIPart(part)) {
      const last = groups.at(-1)
      if (last?.type === 'tools') {
        last.parts.push(part as ToolPart)
      } else {
        groups.push({ type: 'tools', parts: [part as ToolPart] })
      }
    }
  }
  return groups
}

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

  const hasVisibleContent = message.parts.some(
    (p) => p.type === 'text' || p.type === 'reasoning' || isToolUIPart(p),
  )
  const isThinking = isLastMessage && isStreaming && !hasVisibleContent

  return (
    <div className="flex flex-col gap-2">
      {isThinking && (
        <Shimmer className="text-sm" duration={1}>
          Thinking...
        </Shimmer>
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

      {hasReasoning && (
        <Reasoning isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      )}

      {groupParts(message.parts).map((group, gi) => {
        if (group.type === 'text') {
          return (
            <MessageContent key={`${message.id}-text-${gi}`}>
              {message.role === 'assistant' ? (
                <MessageResponse>{group.part.text}</MessageResponse>
              ) : (
                <span>{group.part.text}</span>
              )}
            </MessageContent>
          )
        }

        if (group.type === 'tools') {
          return (
            <div key={`${message.id}-tools-${gi}`} className="flex flex-col gap-0">
              {group.parts.map((part, ti) => {
                const state = part.state
                const isAwaitingApproval = state === 'approval-requested'

                return (
                  <Tool
                    key={`${message.id}-tool-${gi}-${ti}`}
                    className="w-fit max-w-full"
                    defaultOpen={isAwaitingApproval}
                  >
                    {part.type === 'dynamic-tool' ? (
                      <ToolHeader type={part.type} state={state} toolName={part.toolName} />
                    ) : (
                      <ToolHeader type={part.type} state={state} />
                    )}
                    <ToolContent>
                      <ToolInput input={part.input} />
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
                        <ToolOutput output={part.output} errorText={part.errorText} />
                      )}
                    </ToolContent>
                  </Tool>
                )
              })}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
