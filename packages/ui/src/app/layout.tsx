import type { Metadata } from 'next'
import { DM_Sans, Fraunces, JetBrains_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'

import { AppSidebar } from '@/components/app-sidebar'
import { OnboardingGuard } from '@/components/onboarding/onboarding-guard'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { AuthGuard } from '@/providers/auth-guard'
import { PandoraProvider } from '@/providers/pandora-provider'
import { ThemeProvider } from '@/providers/theme-provider'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
})

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['WONK', 'SOFT', 'opsz'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Pandora',
  description: 'Your personal AI agent — self-hosted, extensible, and fully under your control.',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>): Promise<React.JSX.Element> {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${fraunces.variable} ${jetbrainsMono.variable} antialiased`}
      >
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
