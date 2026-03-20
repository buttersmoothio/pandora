const TOKEN_KEY = 'pandora_token'
const REFRESH_TOKEN_KEY = 'pandora_refresh_token'

/** Retrieve the current auth token from localStorage. Returns `null` on the server. */
export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return localStorage.getItem(TOKEN_KEY)
}

/** Retrieve the current refresh token from localStorage. Returns `null` on the server. */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/** Persist an auth/refresh token pair to localStorage. */
export function storeTokens(tokens: { token: string; refreshToken: string }): void {
  localStorage.setItem(TOKEN_KEY, tokens.token)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

/** Remove both auth and refresh tokens from localStorage. */
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
