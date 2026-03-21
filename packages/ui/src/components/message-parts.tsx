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
type ReasoningPart = Extract<UIMessage['parts'][number], { type: 'reasoning' }>
type PartGroup =
  | { type: 'text'; key: string; part: TextPart }
  | { type: 'tools'; key: string; parts: ToolPart[] }
  | { type: 'files'; key: string; parts: FileUIPart[] }
  | { type: 'reasoning'; key: string; parts: ReasoningPart[] }

function appendToLastOrPush(
  groups: PartGroup[],
  expectedType: string,
  part: ReasoningPart | FileUIPart | ToolPart,
  newGroup: PartGroup,
): void {
  const last = groups.at(-1)
  if (last && last.type === expectedType && 'parts' in last) {
    ;(last.parts as (ReasoningPart | FileUIPart | ToolPart)[]).push(part)
  } else {
    groups.push(newGroup)
  }
}

export function groupParts(parts: UIMessage['parts']): PartGroup[] {
  const groups: PartGroup[] = []
  let textIdx = 0
  let fileIdx = 0
  let reasoningIdx = 0
  for (const part of parts) {
    if (part.type === 'text') {
      groups.push({ type: 'text', key: `text-${textIdx++}`, part })
    } else if (part.type === 'reasoning') {
      appendToLastOrPush(groups, 'reasoning', part, {
        type: 'reasoning',
        key: `reasoning-${reasoningIdx++}`,
        parts: [part],
      })
    } else if (part.type === 'file') {
      appendToLastOrPush(groups, 'files', part, {
        type: 'files',
        key: `files-${fileIdx++}`,
        parts: [part],
      })
    } else if (isToolUIPart(part)) {
      appendToLastOrPush(groups, 'tools', part, {
        type: 'tools',
        key: part.toolCallId,
        parts: [part],
      })
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
  const lastPart = message.parts.at(-1)

  const sourceParts = message.parts.filter((p) => p.type === 'source-url')

  const hasVisibleContent = message.parts.some(
    (p) => p.type === 'text' || p.type === 'reasoning' || isToolUIPart(p),
  )
  const isThinking = isLastMessage && isStreaming && !hasVisibleContent

  const groups = groupParts(message.parts)

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

      {groups.map((group, groupIndex) => {
        if (group.type === 'reasoning') {
          const reasoningText = group.parts.map((p) => p.text).join('\n\n')
          const isLastGroup = groupIndex === groups.length - 1
          const isReasoningStreaming =
            isLastMessage && isStreaming && isLastGroup && lastPart?.type === 'reasoning'
          return (
            <Reasoning key={`${message.id}-${group.key}`} isStreaming={isReasoningStreaming}>
              <ReasoningTrigger />
              <ReasoningContent>{reasoningText}</ReasoningContent>
            </Reasoning>
          )
        }

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
                  part.type === 'dynamic-tool'
                    ? undefined
                    : toolNames.get(part.type.replace(/^tool-/, ''))

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
