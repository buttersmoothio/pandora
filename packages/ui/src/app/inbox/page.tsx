'use client'

import {
  AlertCircleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MailIcon,
  MailOpenIcon,
  Trash2Icon,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  if (destination === 'web') return 'Web'
  // Extract plugin ID from nsKey (e.g., "@pandorakit/telegram:telegram" → "@pandorakit/telegram")
  const colonIdx = destination.lastIndexOf(':')
  if (colonIdx !== -1) {
    const pluginId = destination.slice(0, colonIdx)
    const name = channelNames.get(pluginId)
    if (name) return name
  }
  // Fallback: extract the part after the last colon
  return colonIdx !== -1 ? destination.slice(colonIdx + 1) : destination
}

function MessageDetail({
  message,
  open,
  onOpenChange,
  destinationName,
}: {
  message: InboxMessage
  open: boolean
  onOpenChange: (open: boolean) => void
  destinationName: string
}) {
  const deleteMessage = useDeleteInboxMessage()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{message.subject}</DialogTitle>
          <DialogDescription>
            {formatRelativeTime(message.createdAt)}
            {' \u00b7 '}
            {destinationName}
            {message.status === 'failed' && ' \u00b7 Delivery failed'}
            {message.status === 'pending' && ' \u00b7 Delivery pending'}
          </DialogDescription>
        </DialogHeader>

        <div className="whitespace-pre-wrap text-sm">{message.body}</div>

        <DialogFooter className="flex items-center gap-2">
          {message.threadId && (
            <Button variant="outline" size="sm" asChild className="mr-auto">
              <Link href={`/chat/${message.threadId}`}>
                <ExternalLinkIcon className="mr-1 size-3.5" />
                View conversation
              </Link>
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMessage.isPending}
            onClick={() => {
              deleteMessage.mutate(message.id, {
                onSuccess: () => onOpenChange(false),
              })
            }}
          >
            {deleteMessage.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <>
                <Trash2Icon className="mr-1 size-3.5" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MessageList() {
  const { data, isLoading, error } = useInbox()
  const markRead = useMarkInboxRead()
  const deleteMessage = useDeleteInboxMessage()
  const channelNames = useChannelNames()
  const [selected, setSelected] = useState<InboxMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InboxMessage | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-destructive text-sm">Failed to load inbox: {error.message}</p>
  }

  const messages = data?.messages ?? []

  if (messages.length === 0) {
    return <p className="text-muted-foreground text-sm">No messages yet.</p>
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {messages.map((msg) => {
          const destName = resolveDestinationName(msg.destination, channelNames)
          return (
            <button
              type="button"
              key={msg.id}
              className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
              onClick={() => {
                setSelected(msg)
                if (!msg.read) markRead.mutate(msg.id)
              }}
            >
              <div className="shrink-0 text-muted-foreground">
                {msg.read ? <MailOpenIcon className="size-4" /> : <MailIcon className="size-4" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`truncate text-sm ${msg.read ? '' : 'font-semibold'}`}>
                  {msg.subject}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {msg.body.slice(0, 120)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {destName}
                </Badge>
                {msg.status === 'failed' && (
                  <AlertCircleIcon className="size-3.5 text-destructive" />
                )}
                <span className="text-muted-foreground text-xs">
                  {formatRelativeTime(msg.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(msg)
                  }}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <MessageDetail
          message={selected}
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
          destinationName={resolveDestinationName(selected.destination, channelNames)}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete message?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{deleteTarget?.subject}&quot;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMessage.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMessage.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  })
                }
              }}
            >
              {deleteMessage.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function InboxPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">Inbox</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Messages from scheduled tasks and background agent activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MessageList />
        </CardContent>
      </Card>
    </div>
  )
}
