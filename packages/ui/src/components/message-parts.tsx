'use client'

import { useToolNames } from '@pandorakit/react-sdk'
import type {
  ChatAddToolApproveResponseFunction,
  DynamicToolUIPart,
  FileUIPart,
  ToolUIPart,
} from 'ai'
import { isToolUIPart, type UIMessage } from 'ai'
import { CheckIcon, XIcon } from 'lucide-react'
import {
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'

type ToolPart = ToolUIPart | DynamicToolUIPart
type TextPart = Extract<UIMessage['parts'][number], { type: 'text' }>
type PartGroup =
  | { type: 'text'; key: string; part: TextPart }
  | { type: 'tools'; key: string; parts: ToolPart[] }
  | { type: 'files'; key: string; parts: FileUIPart[] }

export function groupParts(parts: UIMessage['parts']): PartGroup[] {
  const groups: PartGroup[] = []
  let textIdx = 0
  let fileIdx = 0
  for (const part of parts) {
    if (part.type === 'text') {
      groups.push({ type: 'text', key: `text-${textIdx++}`, part })
    } else if (part.type === 'file') {
      const last = groups.at(-1)
      if (last?.type === 'files') {
        last.parts.push(part)
      } else {
        groups.push({ type: 'files', key: `files-${fileIdx++}`, parts: [part] })
      }
    } else if (isToolUIPart(part)) {
      const last = groups.at(-1)
      if (last?.type === 'tools') {
        last.parts.push(part)
      } else {
        groups.push({ type: 'tools', key: part.toolCallId, parts: [part] })
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
}): React.JSX.Element {
  const toolNames = useToolNames()
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

      {groupParts(message.parts).map((group) => {
        if (group.type === 'text') {
          return (
            <MessageContent key={`${message.id}-${group.key}`}>
              {message.role === 'assistant' ? (
                <MessageResponse>{group.part.text}</MessageResponse>
              ) : (
                <span>{group.part.text}</span>
              )}
            </MessageContent>
          )
        }

        if (group.type === 'files') {
          return (
            <MessageAttachments key={`${message.id}-${group.key}`}>
              {group.parts.map((part) => (
                <MessageAttachment data={part} key={`${message.id}-${part.url}`} />
              ))}
            </MessageAttachments>
          )
        }

        if (group.type === 'tools') {
          return (
            <div key={`${message.id}-${group.key}`} className="flex flex-col gap-0">
              {group.parts.map((part) => {
                const state = part.state
                const isAwaitingApproval = state === 'approval-requested'
                const resolvedName =
                  part.type !== 'dynamic-tool'
                    ? toolNames.get(part.type.replace(/^tool-/, ''))
                    : undefined

                return (
                  <Tool
                    key={`${message.id}-${part.toolCallId}`}
                    className="w-fit max-w-full"
                    defaultOpen={isAwaitingApproval}
                  >
                    {part.type === 'dynamic-tool' ? (
                      <ToolHeader type={part.type} state={state} toolName={part.toolName} />
                    ) : (
                      <ToolHeader type={part.type} state={state} title={resolvedName} />
                    )}
                    <ToolContent>
                      <ToolInput input={part.input} />
                      {isAwaitingApproval && onToolApproval && part.approval != null && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              onToolApproval({
                                id: part.approval.id,
                                approved: true,
                              })
                            }}
                          >
                            <CheckIcon className="size-3.5" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              onToolApproval({
                                id: part.approval.id,
                                approved: false,
                              })
                            }}
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
