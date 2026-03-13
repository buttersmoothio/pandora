'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type React from 'react'
import type { ReactNode } from 'react'

export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode
  nonce?: string
}): React.JSX.Element {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
