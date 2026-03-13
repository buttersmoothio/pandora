import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'

import { PandoraProvider } from '@pandorakit/react-sdk'
import { AppSidebar } from '@/components/app-sidebar'
import { OnboardingGuard } from '@/components/onboarding/onboarding-guard'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { AuthGuard } from '@/providers/auth-guard'
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
}>): Promise<React.JSX.Element> {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider nonce={nonce}>
          <PandoraProvider baseUrl={process.env.NEXT_PUBLIC_API_URL}>
            <AuthGuard>
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
            </AuthGuard>
            <Toaster />
          </PandoraProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
