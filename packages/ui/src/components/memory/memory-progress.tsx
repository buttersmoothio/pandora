'use client'

import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function MemoryProgress({
  label,
  tokens,
  threshold,
  tooltip,
}: {
  label: string
  tokens: number
  threshold: number
  tooltip: string
}) {
  const percent = threshold > 0 ? Math.min((tokens / threshold) * 100, 100) : 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-muted-foreground">{Math.round(percent)}%</span>
            </div>
            <Progress
              value={percent}
              className={cn(
                'h-1.5',
                percent >= 90 &&
                  'bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive',
                percent >= 70 &&
                  percent < 90 &&
                  'bg-yellow-500/20 [&>[data-slot=progress-indicator]]:bg-yellow-500',
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
