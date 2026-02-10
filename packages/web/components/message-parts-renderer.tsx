"use client";

import type { PandoraMessage, PandoraMessagePart, TokenUsage } from "@/hooks/use-pandora-chat";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import { MemoryContext, type MemoryItem } from "@/components/ai-elements/memory-context";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Image } from "@/components/ai-elements/image";
import { ChevronRightIcon } from "lucide-react";
import { getToolDisplayInfo } from "@/lib/tool-display";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Format token count with K suffix for thousands */
function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/** Token usage display for a message */
function MessageUsageDisplay({ usage }: { usage: TokenUsage }) {
  if (usage.totalTokens === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[10px] text-muted-foreground/60">
            {formatTokens(usage.totalTokens)} tokens
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            <div>Input: {formatTokens(usage.inputTokens)}</div>
            <div>Output: {formatTokens(usage.outputTokens)}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MessagePartsRendererProps {
  message: PandoraMessage;
  isStreaming: boolean;
  isLastMessage: boolean;
  /** Callback for opening subagent threads (main chat only) */
  onOpenThread?: (threadId: string, toolCallId: string, subagentName: string) => void;
  /** Callback for viewing memory details */
  onViewMemory?: (memory: MemoryItem) => void;
  /** Show channel badge for cross-channel messages */
  showChannelBadge?: boolean;
}

/** Single tool call display using AI Elements Tool component */
function ToolCallDisplay({
  tc,
  onOpenThread,
}: {
  tc: Extract<PandoraMessagePart, { type: "dynamic-tool" }>;
  onOpenThread?: (threadId: string, toolCallId: string, subagentName: string) => void;
}) {
  const hasThread = !!tc.threadId;
  const isComplete = tc.state === "output-available";
  const toolInfo = getToolDisplayInfo(tc.toolName);

  // Subagents with threads are clickable to open panel
  if (hasThread && onOpenThread) {
    return (
      <Tool className="group/thread w-auto max-w-full overflow-x-auto">
        <ToolHeader
          title={toolInfo.label}
          type="dynamic-tool"
          state={tc.state}
          toolName={tc.toolName}
        />
        <ToolContent>
          {tc.input != null && <ToolInput input={tc.input} />}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Result
            </h4>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm transition-colors hover:bg-muted"
              onClick={() => onOpenThread(tc.threadId!, tc.toolCallId, tc.toolName)}
            >
              <span>View conversation</span>
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </ToolContent>
      </Tool>
    );
  }

  // Regular tool call
  return (
    <Tool className="w-auto max-w-full overflow-x-auto">
      <ToolHeader
        title={toolInfo.label}
        type="dynamic-tool"
        state={tc.state}
        toolName={tc.toolName}
      />
      <ToolContent>
        {tc.input != null && <ToolInput input={tc.input} />}
        {isComplete && tc.output != null && (
          <ToolOutput output={tc.output} errorText={undefined} />
        )}
      </ToolContent>
    </Tool>
  );
}

/** Tool calls display - renders all tool calls for a message */
function ToolCallsDisplay({
  toolParts,
  onOpenThread,
}: {
  toolParts: Extract<PandoraMessagePart, { type: "dynamic-tool" }>[];
  onOpenThread?: (threadId: string, toolCallId: string, subagentName: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {toolParts.map((tc) => (
        <ToolCallDisplay
          key={tc.toolCallId}
          tc={tc}
          onOpenThread={onOpenThread}
        />
      ))}
    </div>
  );
}

/**
 * Shared message parts renderer component.
 * Renders all parts of a message: reasoning, tool calls, sources, files, and text.
 */
export function MessagePartsRenderer({
  message,
  isStreaming,
  isLastMessage,
  onOpenThread,
  onViewMemory,
  showChannelBadge,
}: MessagePartsRendererProps) {
  const { parts, role, channelName } = message;

  // Group parts by type for organized rendering
  const reasoningParts = parts.filter((p) => p.type === "reasoning");
  const memoryContextParts = parts.filter(
    (p): p is Extract<PandoraMessagePart, { type: "memory-context" }> => p.type === "memory-context"
  );
  const toolParts = parts.filter(
    (p): p is Extract<PandoraMessagePart, { type: "dynamic-tool" }> => p.type === "dynamic-tool"
  );
  const sourceParts = parts.filter((p) => p.type === "source-url" || p.type === "source-document");
  const fileParts = parts.filter((p) => p.type === "file");
  const textParts = parts.filter((p) => p.type === "text");

  // Check if we have text content
  const hasText = textParts.some((p) => p.type === "text" && p.text);
  const textContent = textParts
    .filter((p): p is Extract<PandoraMessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  // Check streaming state for reasoning
  const isReasoningStreaming = isLastMessage && isStreaming && reasoningParts.some(
    (p) => p.type === "reasoning" && p.state === "streaming"
  );

  return (
    <>
      {/* Sources - rendered outside Message per AI Elements convention */}
      {role === "assistant" && sourceParts.length > 0 && (
        <Sources>
          <SourcesTrigger count={sourceParts.length} />
          <SourcesContent>
            {sourceParts.map((part) => {
              if (part.type === "source-url") {
                return (
                  <Source
                    key={part.sourceId}
                    href={part.url}
                    title={part.title || part.url}
                  />
                );
              }
              if (part.type === "source-document") {
                return (
                  <Source
                    key={part.sourceId}
                    title={part.title}
                  />
                );
              }
              return null;
            })}
          </SourcesContent>
        </Sources>
      )}

      <Message from={role}>
        <MessageContent>
          {/* Channel badge for messages from other channels */}
          {showChannelBadge && channelName && channelName !== "web" && (
            <span className="ml-auto text-[10px] text-muted-foreground capitalize">
              via {channelName}
            </span>
          )}

          {/* Reasoning block */}
          {reasoningParts.length > 0 && (
            <Reasoning isStreaming={isReasoningStreaming && !hasText}>
              <ReasoningTrigger />
              <ReasoningContent>
                {reasoningParts
                  .filter((p): p is Extract<PandoraMessagePart, { type: "reasoning" }> => p.type === "reasoning")
                  .map((p) => p.text)
                  .join("")}
              </ReasoningContent>
            </Reasoning>
          )}

          {/* Memory context - recalled facts and episodes */}
          {memoryContextParts.map((part, i) => (
            <MemoryContext
              key={i}
              facts={part.facts}
              episodes={part.episodes}
              onViewMemory={onViewMemory}
            />
          ))}

          {/* Tool calls */}
          {toolParts.length > 0 && (
            <ToolCallsDisplay
              toolParts={toolParts}
              onOpenThread={onOpenThread}
            />
          )}

          {/* Files/Images */}
          {fileParts.map((part, i) => {
            if (part.type !== "file") return null;
            // Check if it's an image
            if (part.mediaType.startsWith("image/")) {
              // Extract base64 from data URL
              const base64Match = part.url.match(/^data:[^;]+;base64,(.+)$/);
              if (base64Match) {
                return (
                  <Image
                    key={i}
                    base64={base64Match[1]}
                    uint8Array={new Uint8Array()}
                    mediaType={part.mediaType}
                    alt={part.filename || "Generated image"}
                    className="max-w-sm rounded-lg"
                  />
                );
              }
              // Regular URL
              return (
                <img
                  key={i}
                  src={part.url}
                  alt={part.filename || "Image"}
                  className="max-w-sm rounded-lg"
                />
              );
            }
            // Non-image file - show as download link
            return (
              <a
                key={i}
                href={part.url}
                download={part.filename}
                className="flex items-center gap-2 rounded bg-muted px-3 py-2 text-sm hover:bg-muted/80"
              >
                📎 {part.filename || "Download file"}
              </a>
            );
          })}

          {/* Text content */}
          {role === "assistant" && !hasText ? (
            <Shimmer>Thinking...</Shimmer>
          ) : (
            textContent && <MessageResponse>{textContent}</MessageResponse>
          )}

          {/* Token usage (for assistant messages with stored usage) */}
          {role === "assistant" && message.usage && message.usage.totalTokens > 0 && (
            <div className="mt-1 flex justify-end">
              <MessageUsageDisplay usage={message.usage} />
            </div>
          )}
        </MessageContent>
      </Message>
    </>
  );
}
