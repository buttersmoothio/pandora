'use client'

import { createClient, type PandoraClient } from '@pandorakit/sdk/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { getRefreshToken, getToken, storeTokens } from '@/lib/token-storage'

interface PandoraContextValue {
  client: PandoraClient
  baseUrl: string
  getToken: () => string | null
}

const PandoraContext: React.Context<PandoraContextValue | null> =
  createContext<PandoraContextValue | null>(null)

export interface PandoraProviderProps {
  /** Pandora server URL. Defaults to `"http://localhost:4111"`. */
  baseUrl?: string
  /** Bring your own React Query client. When omitted, an internal client is created. */
  queryClient?: QueryClient
  children: ReactNode
}

/**
 * Root provider for `@pandorakit/react-sdk`.
 *
 * Wraps your app with a configured {@link PandoraClient} and React Query context.
 * All SDK hooks must be rendered inside this provider.
 *
 * @example
 * ```tsx
 * <PandoraProvider baseUrl="http://localhost:4111">
 *   <App />
 * </PandoraProvider>
 * ```
 */
export function PandoraProvider({
  baseUrl = 'http://localhost:4111',
  queryClient: externalQueryClient,
  children,
}: PandoraProviderProps): React.JSX.Element {
  const [internalQueryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  const queryClient = externalQueryClient ?? internalQueryClient

  const client = useMemo(
    () =>
      createClient({
        baseUrl,
        getToken,
        refreshToken: {
          get: getRefreshToken,
          onRefresh: (tokens: { token: string; refreshToken: string }) => {
            storeTokens(tokens)
          },
        },
      }),
    [baseUrl],
  )

  const contextValue = useMemo<PandoraContextValue>(
    () => ({ client, baseUrl, getToken }),
    [client, baseUrl],
  )

  const inner = <PandoraContext value={contextValue}>{children}</PandoraContext>

  return externalQueryClient ? (
    inner
  ) : (
    <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
  )
}

/** Access the {@link PandoraClient} instance from the nearest {@link PandoraProvider}. */
export function usePandoraClient(): PandoraClient {
  const ctx = useContext(PandoraContext)
  if (!ctx) {
    throw new Error('usePandoraClient must be used within a PandoraProvider')
  }
  return ctx.client
}

/** Access the full provider context (client, baseUrl, getToken) from the nearest {@link PandoraProvider}. */
export function usePandoraContext(): PandoraContextValue {
  const ctx = useContext(PandoraContext)
  if (!ctx) {
    throw new Error('usePandoraContext must be used within a PandoraProvider')
  }
  return ctx
}
