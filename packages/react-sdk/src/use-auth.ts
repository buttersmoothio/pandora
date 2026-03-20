'use client'

import type { PandoraClient, Session } from '@pandorakit/sdk/client'
import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { mapApiError } from './error-utils'
import { sessionsKey } from './keys'
import { usePandoraClient } from './provider'
import { clearTokens, getRefreshToken, storeTokens } from './token-storage'

/** Current authentication state. */
export type AuthStatus = 'loading' | 'setup_required' | 'login_required' | 'authenticated'

export interface UseAuthReturn {
  /** Current auth status. Starts as `'loading'` while the initial check runs. */
  status: AuthStatus
  /** Authenticate with a password. Stores tokens on success. */
  login: (password: string) => Promise<void>
  /** Initial password setup (first-run). Stores tokens on success. */
  setup: (password: string) => Promise<void>
  /** Log out, clearing local tokens. */
  logout: () => Promise<void>
  /** Change the current password. Issues new tokens on success. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  /** Active sessions query. Only fetches when authenticated. */
  sessions: UseQueryResult<Session[]>
  /** Revoke a single session by ID. Returns whether the current session was logged out. */
  revokeSession: (id: string) => Promise<{ loggedOut: boolean }>
  /** Revoke all sessions and log out. */
  revokeAllSessions: () => Promise<void>
}

async function tryRefresh(client: PandoraClient): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return false
  }
  try {
    const tokens = await client.auth.refresh(refreshToken)
    storeTokens(tokens)
    return true
  } catch {
    return false
  }
}

async function resolveAuthStatus(client: PandoraClient): Promise<AuthStatus> {
  try {
    const data = await client.health()
    if (!data.auth.setup) {
      return 'setup_required'
    }
    if (data.auth.authenticated) {
      return 'authenticated'
    }
    if (await tryRefresh(client)) {
      return 'authenticated'
    }
    clearTokens()
    return 'login_required'
  } catch {
    return 'login_required'
  }
}

/**
 * Manage authentication state — login, setup, logout, password changes, and session management.
 *
 * Automatically resolves the initial auth status on mount.
 */
export function useAuth(): UseAuthReturn {
  const client = usePandoraClient()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false

    resolveAuthStatus(client).then((result) => {
      if (!cancelled) {
        setStatus(result)
      }
    })

    return (): void => {
      cancelled = true
    }
  }, [client])

  const login = useCallback(
    async (password: string): Promise<void> => {
      try {
        const tokens = await client.auth.login(password)
        storeTokens(tokens)
        setStatus('authenticated')
      } catch (err) {
        throw mapApiError(err)
      }
    },
    [client],
  )

  const setup = useCallback(
    async (password: string): Promise<void> => {
      try {
        const tokens = await client.auth.setup(password)
        storeTokens(tokens)
        setStatus('authenticated')
      } catch (err) {
        throw mapApiError(err)
      }
    },
    [client],
  )

  const logout = useCallback(async (): Promise<void> => {
    try {
      await client.auth.logout()
    } catch {
      // Ignore errors — clear local state regardless
    }
    clearTokens()
    setStatus('login_required')
  }, [client])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      try {
        const tokens = await client.auth.changePassword(currentPassword, newPassword)
        storeTokens(tokens)
        queryClient.invalidateQueries({ queryKey: sessionsKey })
      } catch (err) {
        throw mapApiError(err)
      }
    },
    [client, queryClient],
  )

  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: async () => {
      const res = await client.auth.sessions()
      return res.data
    },
    enabled: status === 'authenticated',
  })

  const revokeSession = useCallback(
    async (id: string): Promise<{ loggedOut: boolean }> => {
      const data = await client.auth.revokeSession(id)
      queryClient.invalidateQueries({ queryKey: sessionsKey })
      if (data.loggedOut) {
        clearTokens()
        setStatus('login_required')
      }
      return data
    },
    [client, queryClient],
  )

  const revokeAllSessions = useCallback(async (): Promise<void> => {
    await client.auth.revokeAllSessions()
    clearTokens()
    setStatus('login_required')
  }, [client])

  return {
    status,
    login,
    setup,
    logout,
    changePassword,
    sessions,
    revokeSession,
    revokeAllSessions,
  }
}
