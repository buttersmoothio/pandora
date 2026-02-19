'use client'

import { MessageSquareIcon } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const STUB_THREADS = [
  { id: '1', title: 'Getting started with Pandora' },
  { id: '2', title: 'Tool configuration help' },
  { id: '3', title: 'API integration questions' },
]

export function NavThreads() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {STUB_THREADS.map((thread) => (
            <SidebarMenuItem key={thread.id}>
              <SidebarMenuButton tooltip={thread.title}>
                <MessageSquareIcon />
                <span>{thread.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
