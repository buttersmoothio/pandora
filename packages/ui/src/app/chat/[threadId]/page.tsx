'use client'

import { useQuery } from '@tanstack/react-query'
import { LoaderIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { ThreadChat, type ThreadResponse } from '@/components/chat/thread-chat'
import { apiFetch } from '@/lib/api'

export default function ThreadPage(): React.JSX.Element {
  const { threadId } = useParams<{ threadId: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => apiFetch<ThreadResponse>(`/api/threads/${threadId}`),
  })

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
