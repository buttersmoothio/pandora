"use client";

import { XIcon, BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubagentThread } from "@/hooks/use-pandora-chat";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { MessagePartsRenderer } from "@/components/message-parts-renderer";

interface SubagentPanelProps {
  thread: SubagentThread;
  onClose: () => void;
}

/** Right-side panel showing subagent thread details */
export function SubagentPanel({ thread, onClose }: SubagentPanelProps) {
  const isLoading = thread.status === "loading";
  const isStreaming = thread.status === "streaming";

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Icon with gradient background */}
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20">
            <BotIcon className="size-5 text-violet-500" />
          </div>

          {/* Title and subtitle */}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold capitalize">
              {thread.subagentName}
            </h2>
            <p className="text-xs text-muted-foreground">Subagent thread</p>
          </div>

          {/* Close button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title="Close panel"
          >
            <XIcon className="size-4" />
          </Button>
        </div>

        {/* Animated progress bar when streaming */}
        {(isLoading || isStreaming) && (
          <div className="border-t bg-muted/30 px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full animate-pulse bg-gradient-to-r from-violet-500 to-purple-500"
                  style={{ width: isStreaming ? "70%" : "30%" }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {isLoading ? "Loading..." : "Processing..."}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Shimmer>Loading thread...</Shimmer>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {thread.messages.map((msg, idx) => (
              <MessagePartsRenderer
                key={msg.id}
                message={msg}
                isLastMessage={idx === thread.messages.length - 1}
                isStreaming={isStreaming}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
