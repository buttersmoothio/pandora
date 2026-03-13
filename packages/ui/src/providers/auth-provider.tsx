'use client'

import { PandoraApiError } from '@pandorakit/sdk/client'
import type React from 'react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { LoginScreen } from '@/components/auth/login-screen'
import { SetupScreen } from '@/components/auth/setup-screen'
import { clearTokens, client, getRefreshToken, storeTokens } from '@/lib/api'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid password',
  setup_required: 'Please set up your password first',
  already_setup: 'Password has already been configured',
}

function mapApiError(err: unknown): Error {
  if (err instanceof PandoraApiError) {
    try {
      const data = JSON.parse(err.body) as { error?: string }
      const code = data?.error ?? ''
      const message = ERROR_MESSAGES[code] ?? code ?? `Request failed (${err.status})`
      return new Error(message)
    } catch {
      return new Error(ERROR_MESSAGES[err.body] ?? err.body ?? `Request failed (${err.status})`)
    }
  }
  return err instanceof Error ? err : new Error('An unexpected error occurred')
}

type AuthStatus = 'loading' | 'setup_required' | 'login_required' | 'authenticated'

interface AuthContextValue {
  status: AuthStatus
  logout: () => Promise<void>
}

const AuthContext: React.Context<AuthContextValue | null> = createContext<AuthContextValue | null>(
  null,
)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading')

  const checkAuth = useCallback(async () => {
    try {
      const data = await client.health()
      if (!data.auth.setup) {
        setStatus('setup_required')
      } else if (data.auth.authenticated) {
        setStatus('authenticated')
      } else {
        // Not authenticated — try refresh before falling back to login
        const refreshToken = getRefreshToken()
        if (refreshToken) {
          try {
            const tokens = await client.auth.refresh(refreshToken)
            storeTokens(tokens)
            setStatus('authenticated')
            return
          } catch {
            // Refresh failed — fall through to login
          }
        }
        clearTokens()
        setStatus('login_required')
      }
    } catch {
      setStatus('login_required')
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleSetup = useCallback(async (password: string) => {
    try {
      const tokens = await client.auth.setup(password)
      storeTokens(tokens)
      setStatus('authenticated')
    } catch (err) {
      throw mapApiError(err)
    }
  }, [])

  const handleLogin = useCallback(async (password: string) => {
    try {
      const tokens = await client.auth.login(password)
      storeTokens(tokens)
      setStatus('authenticated')
    } catch (err) {
      throw mapApiError(err)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await client.auth.logout()
    } catch {
      // Ignore errors — clear local state regardless
    }
    clearTokens()
    setStatus('login_required')
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (status === 'setup_required') {
    return (
      <AuthContext.Provider value={{ status, logout }}>
        <SetupScreen onSetup={handleSetup} />
      </AuthContext.Provider>
    )
  }

  if (status === 'login_required') {
    return (
      <AuthContext.Provider value={{ status, logout }}>
        <LoginScreen onLogin={handleLogin} />
      </AuthContext.Provider>
    )
  }

  return <AuthContext.Provider value={{ status, logout }}>{children}</AuthContext.Provider>
}
