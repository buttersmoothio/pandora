const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

const TOKEN_KEY = 'pandora_token'
const REFRESH_TOKEN_KEY = 'pandora_refresh_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Shared promise to deduplicate concurrent refresh attempts */
let refreshPromise: Promise<boolean> | null = null

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { token?: string; refreshToken?: string }
    if (data.token) setToken(data.token)
    if (data.refreshToken) setRefreshToken(data.refreshToken)
    return !!data.token
  } catch {
    return false
  }
}

async function fetchWithRefresh(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
  })

  if (res.status !== 401) return res

  // Deduplicate concurrent refresh attempts
  if (!refreshPromise) {
    refreshPromise = attemptRefresh().finally(() => {
      refreshPromise = null
    })
  }

  const refreshed = await refreshPromise
  if (!refreshed) return res

  // Retry with new token
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
  })
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchWithRefresh(`${API_BASE}${path}`, options)

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

export async function apiFetchRaw(path: string, options?: RequestInit): Promise<Response> {
  return fetchWithRefresh(`${API_BASE}${path}`, options)
}
