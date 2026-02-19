import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Session {
  id: string
  createdAt: string
  expiresAt: string
  userAgent?: string
  ip?: string
  current?: boolean
}

interface SessionsResponse {
  sessions: Session[]
}

const SESSIONS_KEY = ['sessions'] as const

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => apiFetch<SessionsResponse>('/api/auth/sessions'),
    select: (data) => data.sessions,
  })
}
