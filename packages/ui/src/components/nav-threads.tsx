'use client'

import {
  ClockIcon,
  HeartPulseIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  TrashIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useDeleteThread, useThreads } from '@/hooks/use-threads'

const SOURCE_ICONS: Record<string, typeof MessageSquareIcon> = {
  heartbeat: HeartPulseIcon,
  schedule: ClockIcon,
}

export function NavThreads() {
  const { data } = useThreads()
  const pathname = usePathname()
  const router = useRouter()
  const deleteThread = useDeleteThread()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const threads = data?.threads ?? []
  const activeStreamIds = data?.activeStreamIds ?? []
  const currentThreadId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null

  if (threads.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {threads.map((thread) => {
            const href = `/chat/${thread.activeThreadId ?? thread.id}`
            const isActive = currentThreadId
              ? (thread.threadIds?.includes(currentThreadId) ?? thread.id === currentThreadId)
              : false
            const streamId = thread.activeThreadId ?? thread.id
            return (
              <SidebarMenuItem key={thread.id}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={thread.title || 'Untitled'}>
                  <Link href={href}>
                    {activeStreamIds.includes(streamId) ? (
                      <span className="relative flex size-4 items-center justify-center">
                        <span className="absolute size-2.5 animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="size-2 rounded-full bg-blue-500" />
                      </span>
                    ) : (
                      (() => {
                        const Icon =
                          SOURCE_ICONS[thread.metadata?.source as string] ?? MessageSquareIcon
                        return <Icon />
                      })()
                    )}
                    <span>{thread.title || 'Untitled'}</span>
                  </Link>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontalIcon />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteTarget(thread.id)}
                    >
                      <TrashIcon />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!deleteTarget) return
                  const threadId = deleteTarget
                  deleteThread.mutate(threadId, {
                    onSuccess: () => {
                      if (pathname === `/chat/${threadId}`) {
                        router.push('/')
                      }
                    },
                  })
                  setDeleteTarget(null)
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarGroup>
  )
}
