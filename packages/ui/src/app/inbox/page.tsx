'use client'

import { type InboxMessage, useInbox, usePlugins } from '@pandorakit/react-sdk'
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
import { toast } from 'sonner'
import { MessageResponse } from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/memory-utils'

/** Resolve a destination nsKey to a human-friendly name. */
function resolveDestinationName(destination: string, channelNames: Map<string, string>): string {
  if (destination === 'web') {
    return 'Web Inbox'
  }
  const colonIdx = destination.lastIndexOf(':')
  if (colonIdx !== -1) {
    const pluginId = destination.slice(0, colonIdx)
    const name = channelNames.get(pluginId)
    if (name) {
      return name
    }
  }
  return colonIdx === -1 ? destination : destination.slice(colonIdx + 1)
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
}): React.JSX.Element {
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
        <span className="text-muted-foreground text-xs">{timeAgo(message.createdAt)}</span>
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
  showArchived,
  onDismiss,
  archive,
  unarchive,
  remove,
}: {
  message: InboxMessage
  channelNames: Map<string, string>
  showArchived: boolean
  onDismiss: () => void
  archive: (id: string) => Promise<InboxMessage>
  unarchive: (id: string) => Promise<InboxMessage>
  remove: (id: string) => Promise<{ deleted: string }>
}): React.JSX.Element {
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const destName = resolveDestinationName(message.destination, channelNames)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header with actions */}
      <div className="flex items-center justify-between border-b px-6 py-2">
        <div className="flex items-center gap-1">
          {showArchived ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isArchiving}
              onClick={(): void => {
                setIsArchiving(true)
                unarchive(message.id)
                  .then(() => onDismiss())
                  .catch((err: Error) => toast.error(`Failed to restore message: ${err.message}`))
                  .finally(() => setIsArchiving(false))
              }}
            >
              {isArchiving ? (
                <Loader2Icon className="mr-1 size-3.5 animate-spin" />
              ) : (
                <InboxIcon className="mr-1 size-3.5" />
              )}
              Unarchive
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={isArchiving}
              onClick={(): void => {
                setIsArchiving(true)
                archive(message.id)
                  .then(() => onDismiss())
                  .catch((err: Error) => toast.error(`Failed to archive message: ${err.message}`))
                  .finally(() => setIsArchiving(false))
              }}
            >
              {isArchiving ? (
                <Loader2Icon className="mr-1 size-3.5 animate-spin" />
              ) : (
                <ArchiveIcon className="mr-1 size-3.5" />
              )}
              Archive
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isDeleting}
            onClick={(): void => {
              setIsDeleting(true)
              remove(message.id)
                .then(() => onDismiss())
                .catch((err: Error) => toast.error(`Failed to delete message: ${err.message}`))
                .finally(() => setIsDeleting(false))
            }}
          >
            {isDeleting ? (
              <Loader2Icon className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Trash2Icon className="mr-1 size-3.5" />
            )}
            Delete
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
          <span>{timeAgo(message.createdAt)}</span>
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

function EmptyDetail(): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <InboxIcon className="mb-3 size-10 opacity-30" />
      <p className="text-sm">Select a message to read</p>
    </div>
  )
}

export default function InboxPage(): React.JSX.Element {
  const [showArchived, setShowArchived] = useState(false)
  const { data, isLoading, error, markRead, archive, unarchive, remove } = useInbox(showArchived)
  const { channelNames } = usePlugins()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const messages = data?.messages ?? []
  const selected = messages.find((m) => m.id === selectedId) ?? null

  const handleSelect = (msg: InboxMessage): void => {
    setSelectedId(msg.id)
    if (!msg.read) {
      markRead(msg.id).catch((err: Error) =>
        toast.error(`Failed to mark message as read: ${err.message}`),
      )
    }
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
        {showArchived ? (
          <>
            <ArchiveIcon className="mb-3 size-10 opacity-30" />
            <p className="font-medium text-foreground text-sm">No archived messages</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={(): void => setShowArchived(false)}
            >
              Back to Inbox
            </Button>
          </>
        ) : (
          <>
            <CheckCheckIcon className="mb-3 size-10 opacity-30" />
            <p className="font-medium text-foreground text-sm">Inbox zero</p>
            <p className="mt-1 text-xs">You're all caught up.</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={(): void => setShowArchived(true)}
            >
              <ArchiveIcon className="mr-1 size-3.5" />
              View Archive
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Message list */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r lg:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="font-semibold text-sm">
            {showArchived ? 'Archived' : 'Inbox'}
            {messages.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">{messages.length}</span>
            )}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={(): void => {
              setShowArchived(!showArchived)
              setSelectedId(null)
            }}
          >
            {showArchived ? (
              <InboxIcon className="mr-1 size-3.5" />
            ) : (
              <ArchiveIcon className="mr-1 size-3.5" />
            )}
            {showArchived ? 'Inbox' : 'Archived'}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {messages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              selected={selectedId === msg.id}
              channelNames={channelNames}
              onSelect={(): void => handleSelect(msg)}
            />
          ))}
        </div>
      </div>

      {/* Detail pane */}
      {selected ? (
        <MessageDetail
          message={selected}
          channelNames={channelNames}
          showArchived={showArchived}
          onDismiss={(): void => setSelectedId(null)}
          archive={archive}
          unarchive={unarchive}
          remove={remove}
        />
      ) : (
        <EmptyDetail />
      )}
    </div>
  )
}
