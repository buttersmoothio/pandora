'use client'

import {
  AlertCircleIcon,
  ArchiveIcon,
  CheckCheckIcon,
  InboxIcon,
  Loader2Icon,
  MailIcon,
  MailOpenIcon,
  ReplyIcon,
  Trash2Icon,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  type InboxMessage,
  useDeleteInboxMessage,
  useInbox,
  useMarkInboxRead,
} from '@/hooks/use-inbox'
import { useChannelNames } from '@/hooks/use-plugins'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Resolve a destination nsKey to a human-friendly name. */
function resolveDestinationName(destination: string, channelNames: Map<string, string>): string {
  if (destination === 'web') return 'Web Inbox'
  const colonIdx = destination.lastIndexOf(':')
  if (colonIdx !== -1) {
    const pluginId = destination.slice(0, colonIdx)
    const name = channelNames.get(pluginId)
    if (name) return name
  }
  return colonIdx !== -1 ? destination.slice(colonIdx + 1) : destination
}

function MessageRow({
  message,
  selected,
  channelNames,
  onSelect,
}: {
  message: InboxMessage
  selected: boolean
  channelNames: Map<string, string>
  onSelect: () => void
}) {
  const destName = resolveDestinationName(message.destination, channelNames)

  return (
    <button
      type="button"
      className={`flex cursor-pointer items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50 ${selected ? 'bg-muted' : ''}`}
      onClick={onSelect}
    >
      <div className="shrink-0 text-muted-foreground">
        {message.read ? (
          <MailOpenIcon className="size-4" />
        ) : (
          <MailIcon className="size-4 text-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm ${message.read ? 'text-muted-foreground' : 'font-semibold'}`}
          >
            {message.subject}
          </span>
          {message.status === 'failed' && (
            <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
          )}
        </div>
        <span className="truncate text-muted-foreground text-xs">{message.body.slice(0, 100)}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-muted-foreground text-xs">
          {formatRelativeTime(message.createdAt)}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {destName}
        </Badge>
      </div>
    </button>
  )
}

function MessageDetail({
  message,
  channelNames,
  onDelete,
}: {
  message: InboxMessage
  channelNames: Map<string, string>
  onDelete: () => void
}) {
  const deleteMessage = useDeleteInboxMessage()
  const destName = resolveDestinationName(message.destination, channelNames)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header with actions */}
      <div className="flex items-center justify-between border-b px-6 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleteMessage.isPending}
            onClick={() => {
              deleteMessage.mutate(message.id, { onSuccess: onDelete })
            }}
          >
            {deleteMessage.isPending ? (
              <Loader2Icon className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Trash2Icon className="mr-1 size-3.5" />
            )}
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={deleteMessage.isPending}
            onClick={() => {
              deleteMessage.mutate(message.id, { onSuccess: onDelete })
            }}
          >
            <ArchiveIcon className="mr-1 size-3.5" />
            Done
          </Button>
        </div>
        {message.threadId && (
          <Button variant="default" size="sm" asChild>
            <Link href={`/chat/${message.threadId}`}>
              <ReplyIcon className="mr-1 size-3.5" />
              Reply
            </Link>
          </Button>
        )}
      </div>

      {/* Subject + meta */}
      <div className="border-b px-6 py-4">
        <h2 className="font-semibold text-lg">{message.subject}</h2>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
          <span>{formatRelativeTime(message.createdAt)}</span>
          <span>&middot;</span>
          <Badge variant="outline" className="text-[10px]">
            {destName}
          </Badge>
          {message.status === 'failed' && (
            <>
              <span>&middot;</span>
              <span className="text-destructive">Delivery failed</span>
            </>
          )}
          {message.status === 'pending' && (
            <>
              <span>&middot;</span>
              <span>Delivery pending</span>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 text-sm">
        <MessageResponse>{message.body}</MessageResponse>
      </div>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <InboxIcon className="mb-3 size-10 opacity-30" />
      <p className="text-sm">Select a message to read</p>
    </div>
  )
}

export default function InboxPage() {
  const { data, isLoading, error } = useInbox()
  const markRead = useMarkInboxRead()
  const channelNames = useChannelNames()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const messages = data?.messages ?? []
  const selected = messages.find((m) => m.id === selectedId) ?? null

  const handleSelect = (msg: InboxMessage) => {
    setSelectedId(msg.id)
    if (!msg.read) markRead.mutate(msg.id)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-destructive text-sm">Failed to load inbox: {error.message}</p>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
        <CheckCheckIcon className="mb-3 size-10 opacity-30" />
        <p className="font-medium text-foreground text-sm">Inbox zero</p>
        <p className="mt-1 text-xs">You're all caught up.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Message list */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r lg:w-96">
        <div className="border-b px-4 py-3">
          <h1 className="font-semibold text-sm">
            Inbox
            {messages.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">{messages.length}</span>
            )}
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {messages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              selected={selectedId === msg.id}
              channelNames={channelNames}
              onSelect={() => handleSelect(msg)}
            />
          ))}
        </div>
      </div>

      {/* Detail pane */}
      {selected ? (
        <MessageDetail
          message={selected}
          channelNames={channelNames}
          onDelete={() => setSelectedId(null)}
        />
      ) : (
        <EmptyDetail />
      )}
    </div>
  )
}
