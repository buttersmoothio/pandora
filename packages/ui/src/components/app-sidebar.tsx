'use client'

import { PlusIcon, SettingsIcon, WrenchIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavThreads } from '@/components/nav-threads'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const NAV_ITEMS = [
  { title: 'Configuration', href: '/config', icon: SettingsIcon },
  { title: 'Tools', href: '/tools', icon: WrenchIcon },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="New Chat">
              <Link href="/">
                <PlusIcon />
                <span>New Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavThreads />
      </SidebarContent>

      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
