import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { client } from '@/lib/api'

export type { Session } from '@pandorakit/sdk/client'

import type { Session } from '@pandorakit/sdk/client'

const SESSIONS_KEY = ['sessions'] as const

export function useSessions(): UseQueryResult<Session[]> {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => client.auth.sessions(),
    select: (data: { sessions: Session[] }) => data.sessions,
  })
}
