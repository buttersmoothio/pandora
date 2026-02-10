"use client";

import { XIcon, BrainIcon, BookOpenIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageResponse } from "@/components/ai-elements/message";
import type { MemoryItem } from "@/components/ai-elements/memory-context";

interface MemoryPanelProps {
  memory: MemoryItem;
  onClose: () => void;
}

/** Format score as percentage */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Format timestamp as date */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format content with proper line breaks for User:/Assistant: turns */
function formatContent(content: string): string {
  // Add line breaks before User: and Assistant: markers
  return content
    .replace(/\s*User:\s*/g, '\n\n**User:** ')
    .replace(/\s*Assistant:\s*/g, '\n\n**Assistant:** ')
    .trim();
}

/** Right-side panel showing full memory content */
export function MemoryPanel({ memory, onClose }: MemoryPanelProps) {
  const isFact = memory.type === "fact";
  const title = isFact ? "Fact" : "Past Interaction";
  const Icon = isFact ? BookOpenIcon : MessageSquareIcon;
  const content = isFact ? memory.data.content : formatContent(memory.data.content);
  const score = memory.data.score;

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Icon with gradient background */}
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
            <Icon className="size-5 text-emerald-500" />
          </div>

          {/* Title and subtitle */}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {formatScore(score)} relevance
            </p>
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
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Metadata */}
        <div className="mb-4 flex flex-wrap gap-2">
          {isFact && memory.data.category && (
            <Badge variant="outline" className="capitalize">
              {memory.data.category}
            </Badge>
          )}
          {!isFact && memory.data.timestamp && (
            <Badge variant="outline">
              {formatDate(memory.data.timestamp)}
            </Badge>
          )}
          <Badge variant="secondary">
            <BrainIcon className="mr-1 size-3" />
            {formatScore(score)}
          </Badge>
        </div>

        {/* Full content */}
        <MessageResponse className="text-sm">{content}</MessageResponse>
      </div>
    </aside>
  );
}
