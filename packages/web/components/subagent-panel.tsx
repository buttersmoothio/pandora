"use client";

import { XIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubagentThread, PandoraMessage, PandoraMessagePart } from "@/hooks/use-pandora-chat";
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

interface SubagentPanelProps {
  thread: SubagentThread;
  onClose: () => void;
}

/** Renders a single message in the subagent panel */
function ThreadMessageRenderer({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: PandoraMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}) {
  const { parts, role } = message;

  const reasoningParts = parts.filter((p) => p.type === "reasoning");
  const toolParts = parts.filter((p) => p.type === "dynamic-tool");
  const sourceParts = parts.filter((p) => p.type === "source-url" || p.type === "source-document");
  const textParts = parts.filter((p) => p.type === "text");

  const hasText = textParts.some((p) => p.type === "text" && p.text);
  const textContent = textParts
    .filter((p): p is Extract<PandoraMessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  const isTextStreaming = isLastMessage && isStreaming && textParts.some(
    (p) => p.type === "text" && p.state === "streaming"
  );
  const isReasoningStreaming = isLastMessage && isStreaming && reasoningParts.some(
    (p) => p.type === "reasoning" && p.state === "streaming"
  );

  return (
    <Message from={role}>
      <MessageContent>
        {/* Reasoning */}
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
          <ChainOfThought>
            <ChainOfThoughtHeader>
              Used {toolParts.length} tool{toolParts.length > 1 ? "s" : ""}
            </ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              {toolParts
                .filter((p): p is Extract<PandoraMessagePart, { type: "dynamic-tool" }> => p.type === "dynamic-tool")
                .map((tc) => (
                  <ChainOfThoughtStep
                    key={tc.toolCallId}
                    label={tc.toolName}
                    description={
                      tc.input
                        ? typeof tc.input === "object"
                          ? Object.entries(tc.input as Record<string, unknown>)
                              .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                              .join(", ")
                          : String(tc.input)
                        : undefined
                    }
                    status={tc.state === "output-available" ? "complete" : "active"}
                  >
                    {tc.state === "output-available" && tc.output != null && (
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                        {typeof tc.output === "string"
                          ? tc.output
                          : JSON.stringify(tc.output, null, 2)}
                      </pre>
                    )}
                  </ChainOfThoughtStep>
                ))}
            </ChainOfThoughtContent>
          </ChainOfThought>
        )}

        {/* Sources */}
        {sourceParts.length > 0 && (
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

        {/* Text */}
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
  );
}

/** Right-side panel showing subagent thread details */
export function SubagentPanel({ thread, onClose }: SubagentPanelProps) {
  const isStreaming = thread.status === "streaming";

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{thread.subagentName}</span>
          {isStreaming && (
            <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Close panel"
        >
          <XIcon className="size-4" />
        </Button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {thread.messages.map((msg, idx) => (
            <ThreadMessageRenderer
              key={msg.id}
              message={msg}
              isLastMessage={idx === thread.messages.length - 1}
              isStreaming={isStreaming}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
