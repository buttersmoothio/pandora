const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

const TOKEN_KEY = 'pandora_token'

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

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

export async function apiFetchRaw(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
  })
}
