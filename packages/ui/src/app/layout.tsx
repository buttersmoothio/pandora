import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'

import { AppSidebar } from '@/components/app-sidebar'
import { OnboardingGuard } from '@/components/onboarding/onboarding-guard'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { ThemeProvider } from '@/providers/theme-provider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Pandora',
  description: 'Pandora AI Assistant',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider nonce={nonce}>
          <QueryProvider>
            <AuthProvider>
              <OnboardingGuard>
                <SidebarProvider>
                  <AppSidebar />
                  <SidebarInset className="min-w-0">
                    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                      <SidebarTrigger className="-ml-1" />
                    </header>
                    <main className="flex min-w-0 flex-1 flex-col">{children}</main>
                  </SidebarInset>
                </SidebarProvider>
              </OnboardingGuard>
            </AuthProvider>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
