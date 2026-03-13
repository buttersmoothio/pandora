'use client'

import type { ForkInfo } from '@pandorakit/react-sdk'
import type { UIMessage } from 'ai'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'

export interface BranchRef {
  id: string
  title?: string
}

export function MessageBranchNav({
  message,
  messageIndex,
  forks,
  forkInfo,
  threadId,
}: {
  message: UIMessage
  messageIndex: number
  forks: Record<string, BranchRef[]>
  forkInfo: ForkInfo | null
  threadId: string
}): React.JSX.Element | null {
  const router = useRouter()

  // Case 1: This thread is the SOURCE — forks[message.id] lists child forks
  const messageForks = forks[message.id]

  // Case 2: This thread is a FORK — forkInfo tells us the fork point + siblings
  const isForkPoint = forkInfo && messageIndex === forkInfo.forkPointIndex

  const branches = useMemo(() => {
    if (messageForks?.length) {
      return [
        { id: threadId, label: 'current' },
        ...messageForks.map((f) => ({ id: f.id, label: f.title ?? f.id.slice(0, 8) })),
      ]
    }
    if (isForkPoint && forkInfo) {
      return [
        { id: forkInfo.sourceThreadId, label: 'original' },
        ...forkInfo.siblings.map((s) => ({ id: s.id, label: s.title ?? s.id.slice(0, 8) })),
        { id: threadId, label: 'current' },
      ]
    }
    return null
  }, [messageForks, isForkPoint, forkInfo, threadId])

  if (!branches) {
    return null
  }

  return (
    <BranchSelector
      branches={branches}
      currentId={threadId}
      onNavigate={(id: string): void => router.push(`/chat/${id}`)}
    />
  )
}

function BranchSelector({
  branches,
  currentId,
  onNavigate,
}: {
  branches: { id: string; label: string }[]
  currentId: string
  onNavigate: (id: string) => void
}): React.JSX.Element | null {
  const currentIndex = branches.findIndex((b) => b.id === currentId)
  const idx = currentIndex === -1 ? 0 : currentIndex

  if (branches.length <= 1) {
    return null
  }

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(): void => {
          const prev = idx > 0 ? idx - 1 : branches.length - 1
          onNavigate(branches[prev].id)
        }}
      >
        <ChevronLeftIcon className="size-3.5" />
      </Button>
      <span className="tabular-nums">
        {idx + 1} / {branches.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(): void => {
          const next = idx < branches.length - 1 ? idx + 1 : 0
          onNavigate(branches[next].id)
        }}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
    </div>
  )
}
