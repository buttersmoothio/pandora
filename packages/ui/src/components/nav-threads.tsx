'use client'

import { MessageSquareIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useThreads } from '@/hooks/use-threads'

export function NavThreads() {
  const { data } = useThreads()
  const pathname = usePathname()
  const threads = data?.threads ?? []
  const activeStreamIds = data?.activeStreamIds ?? []

  if (threads.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {threads.map((thread) => (
            <SidebarMenuItem key={thread.id}>
              <SidebarMenuButton
                asChild
                isActive={pathname === `/chat/${thread.id}`}
                tooltip={thread.title || 'Untitled'}
              >
                <Link href={`/chat/${thread.id}`}>
                  {activeStreamIds.includes(thread.id) ? (
                    <span className="relative flex size-4 items-center justify-center">
                      <span className="absolute size-2.5 animate-ping rounded-full bg-blue-400 opacity-75" />
                      <span className="size-2 rounded-full bg-blue-500" />
                    </span>
                  ) : (
                    <MessageSquareIcon />
                  )}
                  <span>{thread.title || 'Untitled'}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
