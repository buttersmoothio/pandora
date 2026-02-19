const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4111'

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}
