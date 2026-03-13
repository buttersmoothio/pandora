import type { AuthTokenPair, Session } from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Authentication client — password auth, sessions, and token management.
 *
 * Access via `client.auth`.
 */
export interface AuthClient {
  /**
   * Set the initial password (first-time setup). Auto-logs in.
   * @param password - Password to set (minimum length enforced by server).
   * @throws {@link PandoraApiError} with status `409` if already set up.
   */
  setup(password: string): Promise<AuthTokenPair>

  /**
   * Log in with a password.
   * @param password - The account password.
   * @throws {@link PandoraApiError} with status `401` on invalid credentials.
   */
  login(password: string): Promise<AuthTokenPair>

  /** Log out and invalidate the current session. */
  logout(): Promise<{ success: true }>

  /**
   * Exchange a refresh token for a new access + refresh token pair.
   * @param refreshToken - The current refresh token.
   * @throws {@link PandoraApiError} with status `401` if the token is invalid or expired.
   */
  refresh(refreshToken: string): Promise<AuthTokenPair>

  /**
   * Change the account password. Invalidates all existing sessions
   * and returns a new token pair for the current session.
   * @param currentPassword - The current password.
   * @param newPassword - The new password.
   * @throws {@link PandoraApiError} with status `401` if `currentPassword` is wrong.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<AuthTokenPair>

  /** List all active sessions. */
  sessions(): Promise<{ sessions: Session[] }>

  /**
   * Revoke a specific session.
   * @param id - Session ID to revoke.
   * @returns `loggedOut` is `true` if the revoked session was the current one.
   * @throws {@link PandoraApiError} with status `404` if session not found.
   */
  revokeSession(id: string): Promise<{ success: true; loggedOut: boolean }>

  /** Revoke all sessions and refresh tokens. */
  revokeAllSessions(): Promise<{ success: true }>
}

/** @internal */
export function createAuthClient(ctx: FetchContext): AuthClient {
  return {
    setup(password: string): Promise<AuthTokenPair> {
      return fetchJson(ctx, '/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
    },
    login(password: string): Promise<AuthTokenPair> {
      return fetchJson(ctx, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
    },
    logout(): Promise<{ success: true }> {
      return fetchJson(ctx, '/api/auth/logout', { method: 'POST' })
    },
    refresh(refreshToken: string): Promise<AuthTokenPair> {
      return fetchJson(ctx, '/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
    },
    changePassword(currentPassword: string, newPassword: string): Promise<AuthTokenPair> {
      return fetchJson(ctx, '/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
    },
    sessions(): Promise<{ sessions: Session[] }> {
      return fetchJson(ctx, '/api/auth/sessions')
    },
    revokeSession(id: string): Promise<{ success: true; loggedOut: boolean }> {
      return fetchJson(ctx, `/api/auth/sessions/${id}`, { method: 'DELETE' })
    },
    revokeAllSessions(): Promise<{ success: true }> {
      return fetchJson(ctx, '/api/auth/sessions', { method: 'DELETE' })
    },
  }
}
