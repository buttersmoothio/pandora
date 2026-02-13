"use client";

import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { ActivityIcon } from "lucide-react";

/** Format token count with K/M/B suffix */
function formatTokens(count: number): string {
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(1)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

/** Format cost in USD */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/** Token usage breakdown */
export interface ContextUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Cost breakdown */
export interface ContextCosts {
  inputUSD?: number;
  outputUSD?: number;
  reasoningUSD?: number;
  cacheReadUSD?: number;
  cacheWriteUSD?: number;
  totalUSD?: number;
}

export interface ContextProps extends ComponentProps<typeof HoverCard> {
  /** Total context window size in tokens */
  maxTokens: number;
  /** Currently consumed tokens */
  usedTokens: number;
  /** Detailed token usage breakdown */
  usage?: ContextUsage;
  /** Cost breakdown */
  costs?: ContextCosts;
  /** Model identifier */
  modelId?: string;
  /** Whether context is healthy */
  isHealthy?: boolean;
  children?: ReactNode;
}

interface ContextData {
  maxTokens: number;
  usedTokens: number;
  percentUsed: number;
  usage?: ContextUsage;
  costs?: ContextCosts;
  modelId?: string;
  isHealthy?: boolean;
}

const ContextDataContext = createContext<ContextData | null>(null);

function useContextData() {
  const ctx = useContext(ContextDataContext);
  if (!ctx) {
    throw new Error("Context components must be used within <Context>");
  }
  return ctx;
}

export function Context({
  maxTokens,
  usedTokens,
  usage,
  costs,
  modelId,
  isHealthy = true,
  children,
  ...props
}: ContextProps) {
  const percentUsed = maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : 0;

  const contextData: ContextData = {
    maxTokens,
    usedTokens,
    percentUsed,
    usage,
    costs,
    modelId,
    isHealthy,
  };

  return (
    <ContextDataContext.Provider value={contextData}>
      <HoverCard openDelay={200} closeDelay={100} {...props}>
        {children}
      </HoverCard>
    </ContextDataContext.Provider>
  );
}

export interface ContextTriggerProps extends ComponentProps<typeof HoverCardTrigger> {
  /** Show percentage text */
  showPercent?: boolean;
  /** Custom icon */
  icon?: ReactNode;
}

export function ContextTrigger({
  className,
  showPercent = true,
  icon,
  children,
  ...props
}: ContextTriggerProps) {
  const { percentUsed, isHealthy } = useContextData();

  const statusColor = !isHealthy
    ? "text-destructive"
    : percentUsed > 80
      ? "text-yellow-500"
      : "text-muted-foreground";

  return (
    <HoverCardTrigger asChild {...props}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 text-xs transition-colors hover:text-foreground",
          statusColor,
          className
        )}
      >
        {children ?? (
          <>
            {icon ?? <ActivityIcon className="size-3.5" />}
            {showPercent && <span>{Math.round(percentUsed)}%</span>}
          </>
        )}
      </button>
    </HoverCardTrigger>
  );
}

export interface ContextContentProps extends ComponentProps<typeof HoverCardContent> {}

export function ContextContent({ className, children, ...props }: ContextContentProps) {
  return (
    <HoverCardContent
      className={cn("w-72 p-0", className)}
      side="top"
      align="end"
      {...props}
    >
      {children}
    </HoverCardContent>
  );
}

export interface ContextContentHeaderProps extends ComponentProps<"div"> {}

export function ContextContentHeader({ className, children, ...props }: ContextContentHeaderProps) {
  const { usedTokens, maxTokens, percentUsed, isHealthy, modelId } = useContextData();

  const progressColor = !isHealthy
    ? "bg-destructive"
    : percentUsed > 80
      ? "bg-yellow-500"
      : "bg-primary";

  return (
    <div className={cn("border-b p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Context Usage</span>
            <span className="text-muted-foreground">
              {formatTokens(usedTokens)} / {formatTokens(maxTokens)}
            </span>
          </div>
          {modelId && (
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {modelId}
            </div>
          )}
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", progressColor)}
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(percentUsed)}% used</span>
            {!isHealthy && <span className="text-destructive">Compaction needed</span>}
          </div>
        </>
      )}
    </div>
  );
}

export interface ContextContentBodyProps extends ComponentProps<"div"> {}

export function ContextContentBody({ className, children, ...props }: ContextContentBodyProps) {
  return (
    <div className={cn("p-3 space-y-2", className)} {...props}>
      {children}
    </div>
  );
}

export interface ContextContentFooterProps extends ComponentProps<"div"> {}

export function ContextContentFooter({ className, children, ...props }: ContextContentFooterProps) {
  const { costs } = useContextData();
  const totalCost = costs?.totalUSD ?? 0;

  return (
    <div className={cn("border-t p-3", className)} {...props}>
      {children ?? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Cost</span>
          <span className="font-medium">{formatCost(totalCost)}</span>
        </div>
      )}
    </div>
  );
}

interface UsageRowProps extends ComponentProps<"div"> {
  label: string;
  tokens?: number;
  cost?: number;
}

function UsageRow({ label, tokens, cost, className, ...props }: UsageRowProps) {
  if (!tokens && tokens !== 0) return null;

  return (
    <div className={cn("flex items-center justify-between text-xs", className)} {...props}>
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span>{formatTokens(tokens)}</span>
        {cost !== undefined && cost > 0 && (
          <span className="text-muted-foreground">{formatCost(cost)}</span>
        )}
      </div>
    </div>
  );
}

export interface ContextInputUsageProps extends ComponentProps<"div"> {}

export function ContextInputUsage({ className, children, ...props }: ContextInputUsageProps) {
  const { usage, costs } = useContextData();
  if (children) return <div className={className} {...props}>{children}</div>;
  return (
    <UsageRow
      label="Input"
      tokens={usage?.inputTokens}
      cost={costs?.inputUSD}
      className={className}
      {...props}
    />
  );
}

export interface ContextOutputUsageProps extends ComponentProps<"div"> {}

export function ContextOutputUsage({ className, children, ...props }: ContextOutputUsageProps) {
  const { usage, costs } = useContextData();
  if (children) return <div className={className} {...props}>{children}</div>;
  return (
    <UsageRow
      label="Output"
      tokens={usage?.outputTokens}
      cost={costs?.outputUSD}
      className={className}
      {...props}
    />
  );
}

export interface ContextReasoningUsageProps extends ComponentProps<"div"> {}

export function ContextReasoningUsage({ className, children, ...props }: ContextReasoningUsageProps) {
  const { usage, costs } = useContextData();
  if (children) return <div className={className} {...props}>{children}</div>;
  if (!usage?.reasoningTokens) return null;
  return (
    <UsageRow
      label="Reasoning"
      tokens={usage.reasoningTokens}
      cost={costs?.reasoningUSD}
      className={className}
      {...props}
    />
  );
}

export interface ContextCacheUsageProps extends ComponentProps<"div"> {}

export function ContextCacheUsage({ className, children, ...props }: ContextCacheUsageProps) {
  const { usage, costs } = useContextData();
  if (children) return <div className={className} {...props}>{children}</div>;

  const cacheTokens = (usage?.cacheReadTokens ?? 0) + (usage?.cacheWriteTokens ?? 0);
  const cacheCost = (costs?.cacheReadUSD ?? 0) + (costs?.cacheWriteUSD ?? 0);

  if (!cacheTokens) return null;

  return (
    <UsageRow
      label="Cache"
      tokens={cacheTokens}
      cost={cacheCost}
      className={className}
      {...props}
    />
  );
}
