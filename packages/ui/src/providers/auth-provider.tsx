'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { LoginScreen } from '@/components/auth/login-screen'
import { SetupScreen } from '@/components/auth/setup-screen'
import { apiFetchRaw, clearToken, getToken, setToken } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid password',
  setup_required: 'Please set up your password first',
  already_setup: 'Password has already been configured',
}

async function authFetch<T>(path: string, body: unknown): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    const code = data?.error ?? ''
    throw new Error(ERROR_MESSAGES[code] ?? code ?? `Request failed (${res.status})`)
  }

  return data as T
}

type AuthStatus = 'loading' | 'setup_required' | 'login_required' | 'authenticated'

interface AuthContextValue {
  status: AuthStatus
  token: string | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

interface HealthResponse {
  auth: { setup: boolean; authenticated: boolean }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [token, setTokenState] = useState<string | null>(null)

  const checkAuth = useCallback(async () => {
    try {
      const res = await apiFetchRaw('/')
      if (!res.ok) {
        setStatus('login_required')
        return
      }
      const data = (await res.json()) as HealthResponse
      if (!data.auth.setup) {
        setStatus('setup_required')
      } else if (data.auth.authenticated) {
        setTokenState(getToken())
        setStatus('authenticated')
      } else {
        clearToken()
        setTokenState(null)
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
    const data = await authFetch<{ token: string }>('/api/auth/setup', { password })
    setToken(data.token)
    setTokenState(data.token)
    setStatus('authenticated')
  }, [])

  const handleLogin = useCallback(async (password: string) => {
    const data = await authFetch<{ token: string }>('/api/auth/login', { password })
    setToken(data.token)
    setTokenState(data.token)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authFetch('/api/auth/logout', {})
    } catch {
      // Ignore errors — clear local state regardless
    }
    clearToken()
    setTokenState(null)
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
      <AuthContext.Provider value={{ status, token, logout }}>
        <SetupScreen onSetup={handleSetup} />
      </AuthContext.Provider>
    )
  }

  if (status === 'login_required') {
    return (
      <AuthContext.Provider value={{ status, token, logout }}>
        <LoginScreen onLogin={handleLogin} />
      </AuthContext.Provider>
    )
  }

  return <AuthContext.Provider value={{ status, token, logout }}>{children}</AuthContext.Provider>
}
