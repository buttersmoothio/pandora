'use client'

import { LoaderIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { ThreadChat } from '@/components/chat/thread-chat'
import { useThread } from '@/hooks/use-threads'

export default function ThreadPage(): React.JSX.Element {
  const { threadId } = useParams<{ threadId: string }>()

  const { data, isLoading } = useThread(threadId)

  if (isLoading || !data) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ThreadChat
      threadId={threadId}
      serverMessages={data.messages}
      forks={data.forks}
      forkInfo={data.forkInfo}
    />
  )
}
