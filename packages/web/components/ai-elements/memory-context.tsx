"use client";

import type { ComponentProps } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BrainIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { memo, useState } from "react";

export interface MemoryFact {
  content: string;
  category?: string;
  score: number;
}

export interface MemoryEpisode {
  content: string;
  timestamp?: number;
  score: number;
}

export type MemoryItem =
  | { type: "fact"; data: MemoryFact }
  | { type: "episode"; data: MemoryEpisode };

export interface MemoryContextProps extends ComponentProps<"div"> {
  facts: MemoryFact[];
  episodes: MemoryEpisode[];
  defaultOpen?: boolean;
  onViewMemory?: (memory: MemoryItem) => void;
}

/** Format score as percentage */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Format timestamp as relative date */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Memory context display component.
 * Shows recalled facts and episodes in a collapsible section.
 */
export const MemoryContext = memo(
  ({ facts, episodes, defaultOpen = false, onViewMemory, className, ...props }: MemoryContextProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const totalCount = facts.length + episodes.length;

    if (totalCount === 0) return null;

    const isClickable = !!onViewMemory;

    return (
      <div className={cn("not-prose mb-4 w-fit max-w-full", className)} {...props}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-md border">
          <CollapsibleTrigger className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            <BrainIcon className="size-4" />
            <span>
              Recalled {totalCount} memor{totalCount === 1 ? "y" : "ies"}
            </span>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              {facts.length} fact{facts.length !== 1 ? "s" : ""} / {episodes.length} episode{episodes.length !== 1 ? "s" : ""}
            </Badge>
            <ChevronDownIcon
              className={cn(
                "size-4 transition-transform",
                isOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-3 border-t px-3 py-2 text-sm">
            {/* Facts section */}
            {facts.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Facts
                </div>
                <div className="space-y-0.5">
                  {facts.map((fact, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => onViewMemory?.({ type: "fact", data: fact })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs",
                        isClickable && "transition-colors hover:bg-muted"
                      )}
                    >
                      {fact.category && (
                        <span className="shrink-0 text-muted-foreground capitalize">{fact.category}</span>
                      )}
                      <span className="shrink-0 text-muted-foreground">{formatScore(fact.score)}</span>
                      <span className="flex-1 truncate text-foreground/80">{fact.content.split('\n')[0]}</span>
                      {isClickable && <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Episodes section */}
            {episodes.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Past Interactions
                </div>
                <div className="space-y-0.5">
                  {episodes.map((episode, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => onViewMemory?.({ type: "episode", data: episode })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs",
                        isClickable && "transition-colors hover:bg-muted"
                      )}
                    >
                      {episode.timestamp && (
                        <span className="shrink-0 text-muted-foreground">{formatDate(episode.timestamp)}</span>
                      )}
                      <span className="shrink-0 text-muted-foreground">{formatScore(episode.score)}</span>
                      <span className="flex-1 truncate text-foreground/80">{episode.content.split('\n')[0]}</span>
                      {isClickable && <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }
);

MemoryContext.displayName = "MemoryContext";
