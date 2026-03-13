'use client'

import { useAuth } from '@pandorakit/react-sdk'
import type React from 'react'
import type { ReactNode } from 'react'
import { LoginScreen } from '@/components/auth/login-screen'
import { SetupScreen } from '@/components/auth/setup-screen'

export function AuthGuard({ children }: { children: ReactNode }): React.JSX.Element {
  const { status, login, setup } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (status === 'setup_required') {
    return <SetupScreen onSetup={setup} />
  }

  if (status === 'login_required') {
    return <LoginScreen onLogin={login} />
  }

  return <>{children}</>
}
