"use client";

import { useState } from "react";
import type { PandoraMessage, PandoraMessagePart } from "@/hooks/use-pandora-chat";
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
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Image } from "@/components/ai-elements/image";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRightIcon,
  LoaderCircleIcon,
  WrenchIcon,
  CheckCircle2Icon,
  BotIcon,
} from "lucide-react";
import { getToolDisplayInfo } from "@/lib/tool-display";

interface MessagePartsRendererProps {
  message: PandoraMessage;
  isStreaming: boolean;
  isLastMessage: boolean;
  /** Callback for opening subagent threads (main chat only) */
  onOpenThread?: (threadId: string, toolCallId: string, subagentName: string) => void;
  /** Styling variant: "main" for full chat, "panel" for subagent panel */
  variant?: "main" | "panel";
  /** Show channel badge for cross-channel messages */
  showChannelBadge?: boolean;
}

/** Tool output with nested collapsible */
function ToolOutputCollapsible({ output }: { output: unknown }) {
  const [open, setOpen] = useState(false);
  const outputStr = typeof output === "string" ? output : JSON.stringify(output, null, 2);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRightIcon className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />
        View output
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
          {outputStr}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Render input parameters as chips */
function ToolInputChips({ input }: { input: unknown }) {
  if (!input || typeof input !== "object") {
    return input ? <span className="text-muted-foreground">{String(input)}</span> : null;
  }

  const entries = Object.entries(input as Record<string, unknown>);
  const displayEntries = entries.slice(0, 3);
  const remaining = entries.length - 3;

  return (
    <div className="flex flex-wrap gap-1">
      {displayEntries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
        >
          <span className="font-medium text-muted-foreground">{key}:</span>
          <span className="max-w-[120px] truncate">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </span>
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-muted-foreground">+{remaining} more</span>
      )}
    </div>
  );
}

/** Tool calls display - shared between main and panel variants */
function ToolCallsDisplay({
  toolParts,
  onOpenThread,
  variant,
}: {
  toolParts: Extract<PandoraMessagePart, { type: "dynamic-tool" }>[];
  onOpenThread?: (threadId: string, toolCallId: string, subagentName: string) => void;
  variant: "main" | "panel";
}) {
  const activeCount = toolParts.filter((tc) => tc.state !== "output-available").length;
  const completedCount = toolParts.filter((tc) => tc.state === "output-available").length;
  const isActive = activeCount > 0;

  // Panel variant uses simpler header
  if (variant === "panel") {
    return (
      <ChainOfThought>
        <ChainOfThoughtHeader>
          <span className="flex items-center gap-2">
            {isActive ? (
              <>
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                Running {activeCount} tool{activeCount > 1 ? "s" : ""}...
              </>
            ) : (
              <>Used {toolParts.length} tool{toolParts.length > 1 ? "s" : ""}</>
            )}
          </span>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {toolParts.map((tc) => {
            const isComplete = tc.state === "output-available";
            const hasOutput = isComplete && tc.output != null;
            const toolInfo = getToolDisplayInfo(tc.toolName);

            return (
              <ChainOfThoughtStep
                key={tc.toolCallId}
                icon={toolInfo.icon}
                label={<span className={toolInfo.color}>{toolInfo.label}</span>}
                description={tc.input ? <ToolInputChips input={tc.input} /> : undefined}
                status={isComplete ? "complete" : "active"}
              >
                {hasOutput && <ToolOutputCollapsible output={tc.output} />}
              </ChainOfThoughtStep>
            );
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
    );
  }

  // Main variant with enhanced header and thread navigation
  return (
    <ChainOfThought defaultOpen={isActive}>
      <ChainOfThoughtHeader className="py-2">
        <div className="flex items-center gap-3">
          {/* Icon with gradient background */}
          <div
            className={`flex size-7 items-center justify-center rounded-lg ${
              isActive
                ? "bg-gradient-to-br from-blue-500/20 to-indigo-500/20"
                : "bg-muted"
            }`}
          >
            <WrenchIcon
              className={`size-3.5 ${isActive ? "text-blue-500" : "text-muted-foreground"}`}
            />
          </div>

          {/* Label */}
          <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
            Tool calls
          </span>

          {/* Count badge */}
          <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
            {toolParts.length}
          </Badge>

          {/* Status indicators */}
          {isActive && (
            <span className="flex items-center gap-1.5 text-xs text-blue-500">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              {activeCount} running
            </span>
          )}
          {!isActive && completedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2Icon className="size-3" />
            </span>
          )}
        </div>
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {toolParts.map((tc) => {
          const hasThread = !!tc.threadId;
          const isComplete = tc.state === "output-available";
          const hasOutput = isComplete && tc.output != null;
          const toolInfo = getToolDisplayInfo(tc.toolName);

          const stepContent = (
            <ChainOfThoughtStep
              key={tc.toolCallId}
              icon={toolInfo.icon}
              label={
                <span className="flex items-center gap-2">
                  <span className={toolInfo.color}>{toolInfo.label}</span>
                  {hasThread && (
                    <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal">
                      <BotIcon className="size-2.5" />
                      Subagent
                    </Badge>
                  )}
                </span>
              }
              description={tc.input ? <ToolInputChips input={tc.input} /> : undefined}
              status={isComplete ? "complete" : "active"}
            >
              {/* Regular tools: nested collapsible for output */}
              {!hasThread && hasOutput && (
                <ToolOutputCollapsible output={tc.output} />
              )}
            </ChainOfThoughtStep>
          );

          if (hasThread && onOpenThread) {
            return (
              <div
                key={tc.toolCallId}
                className="group/thread -mx-2 cursor-pointer rounded px-2 transition-colors hover:bg-accent/50"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenThread(tc.threadId!, tc.toolCallId, tc.toolName);
                }}
                title="Click to view subagent thread"
              >
                <div className="flex items-start">
                  <div className="flex-1">{stepContent}</div>
                  <ChevronRightIcon className="mt-1 size-4 text-muted-foreground transition-transform group-hover/thread:translate-x-0.5 group-hover/thread:text-foreground" />
                </div>
              </div>
            );
          }

          return <div key={tc.toolCallId}>{stepContent}</div>;
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
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
  variant = "main",
  showChannelBadge,
}: MessagePartsRendererProps) {
  const { parts, role, channelName } = message;

  // Group parts by type for organized rendering
  const reasoningParts = parts.filter((p) => p.type === "reasoning");
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

  // Check streaming state
  const isTextStreaming = isLastMessage && isStreaming && textParts.some(
    (p) => p.type === "text" && p.state === "streaming"
  );
  const isReasoningStreaming = isLastMessage && isStreaming && reasoningParts.some(
    (p) => p.type === "reasoning" && p.state === "streaming"
  );

  // Variant-based styling
  const imageMaxWidth = variant === "main" ? "max-w-sm" : "max-w-full";

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

          {/* Tool calls */}
          {toolParts.length > 0 && (
            <ToolCallsDisplay
              toolParts={toolParts}
              onOpenThread={onOpenThread}
              variant={variant}
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
                    className={`${imageMaxWidth} rounded-lg`}
                  />
                );
              }
              // Regular URL
              return (
                <img
                  key={i}
                  src={part.url}
                  alt={part.filename || "Image"}
                  className={`${imageMaxWidth} rounded-lg`}
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
            <Shimmer>
              {toolParts.length > 0
                ? "Working..."
                : reasoningParts.length > 0
                  ? "Reasoning..."
                  : "Thinking..."}
            </Shimmer>
          ) : (
            textContent && <MessageResponse>{textContent}</MessageResponse>
          )}
        </MessageContent>
      </Message>
    </>
  );
}
