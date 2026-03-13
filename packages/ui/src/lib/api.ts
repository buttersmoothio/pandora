import { createClient, type PandoraClient } from '@pandorakit/sdk/client'

export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4111'

const TOKEN_KEY = 'pandora_token'
const REFRESH_TOKEN_KEY = 'pandora_refresh_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function storeTokens(tokens: { token: string; refreshToken: string }): void {
  setToken(tokens.token)
  setRefreshToken(tokens.refreshToken)
}

export function clearTokens(): void {
  clearToken()
  clearRefreshToken()
}

export const client: PandoraClient = createClient({
  baseUrl: API_URL,
  getToken,
  refreshToken: {
    get: getRefreshToken,
    onRefresh: (tokens) => {
      storeTokens(tokens)
    },
  },
})
