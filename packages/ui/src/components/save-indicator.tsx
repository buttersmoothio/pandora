import { CheckIcon, Loader2Icon } from 'lucide-react'

interface SaveIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error'
}

export function SaveIndicator({ status }: SaveIndicatorProps): React.JSX.Element | null {
  if (status === 'idle') {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
      {status === 'saving' && (
        <>
          <Loader2Icon className="size-3 animate-spin" />
          Saving
        </>
      )}
      {status === 'saved' && (
        <>
          <CheckIcon className="size-3" />
          Saved
        </>
      )}
      {status === 'error' && <span className="text-destructive">Failed to save</span>}
    </span>
  )
}
