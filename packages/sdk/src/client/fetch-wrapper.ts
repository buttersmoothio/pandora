/**
 * Internal HTTP primitives for the Pandora client.
 *
 * Provides {@link ClientOptions} for configuration, {@link PandoraApiError}
 * for typed error handling, and the internal `fetchJson` / `fetchRaw` helpers
 * that all namespace clients delegate to.
 *
 * @packageDocumentation
 */

import type { AuthTokenPair } from '../api-types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options for {@link createClient}.
 *
 * All fields are optional — sensible defaults are applied.
 *
 * @example
 * ```ts
 * const client = createClient({
 *   baseUrl: 'https://pandora.example.com',
 *   getToken: () => localStorage.getItem('pandora_token'),
 *   refreshToken: {
 *     get: () => localStorage.getItem('pandora_refresh_token'),
 *     onRefresh: (tokens) => {
 *       localStorage.setItem('pandora_token', tokens.token)
 *       localStorage.setItem('pandora_refresh_token', tokens.refreshToken)
 *     },
 *   },
 * })
 * ```
 */
export interface ClientOptions {
  /**
   * Base URL of the Pandora server.
   * @defaultValue `"http://localhost:4111"`
   */
  baseUrl?: string
  /**
   * Returns the current access token, or `null` if unauthenticated.
   *
   * Called before every request. May be async (e.g. reading from a store).
   */
  getToken?: () => string | null | Promise<string | null>
  /**
   * Opt-in automatic token refresh on `401` responses.
   *
   * When configured, the client intercepts 401 responses, calls `get()` to
   * retrieve the current refresh token, exchanges it for a new token pair,
   * calls `onRefresh()` with the rotated pair, and retries the original
   * request. Concurrent 401s are deduplicated into a single refresh call.
   */
  refreshToken?: {
    /** Returns the current refresh token. */
    get: () => string | null | Promise<string | null>
    /**
     * Called after a successful token refresh with the new rotated pair.
     * Persist them here (e.g. write to `localStorage`).
     */
    onRefresh: (tokens: AuthTokenPair) => void | Promise<void>
  }
  /**
   * Custom `fetch` implementation.
   *
   * Useful for testing (mock fetch), proxies, or non-standard runtimes.
   * Defaults to `globalThis.fetch`.
   */
  fetch?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>
}

/**
 * Error thrown on non-2xx API responses.
 *
 * Provides the HTTP `status` code and the response `body` as a string
 * for programmatic error handling.
 *
 * @example
 * ```ts
 * try {
 *   await client.threads.get('nonexistent')
 * } catch (err) {
 *   if (err instanceof PandoraApiError && err.status === 404) {
 *     console.log('Thread not found')
 *   }
 * }
 * ```
 */
export class PandoraApiError extends Error {
  /** HTTP status code of the failed response. */
  readonly status: number
  /** Response body text. */
  readonly body: string

  constructor(status: number, body: string) {
    super(`API error ${status}: ${body}`)
    this.name = 'PandoraApiError'
    this.status = status
    this.body = body
  }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** @internal */
type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>

/** @internal Resolved client configuration used by all fetch helpers. */
export interface FetchContext {
  baseUrl: string
  getToken: () => string | null | Promise<string | null>
  refreshToken: ClientOptions['refreshToken']
  fetch: FetchFn
}

/** @internal Resolve {@link ClientOptions} into a {@link FetchContext}. */
export function buildContext(options: ClientOptions): FetchContext {
  return {
    baseUrl: (options.baseUrl ?? 'http://localhost:4111').replace(/\/+$/, ''),
    getToken: options.getToken ?? (() => null),
    refreshToken: options.refreshToken,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
  }
}

// ---------------------------------------------------------------------------
// Auth header helper
// ---------------------------------------------------------------------------

async function authHeaders(ctx: FetchContext): Promise<Record<string, string>> {
  const token = await ctx.getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------------------------------------------------------------------------
// Refresh deduplication
// ---------------------------------------------------------------------------

let _refreshPromise: Promise<boolean> | null = null

async function attemptRefresh(ctx: FetchContext): Promise<boolean> {
  if (!ctx.refreshToken) {
    return false
  }

  const refreshToken = await ctx.refreshToken.get()
  if (!refreshToken) {
    return false
  }

  try {
    const res = await ctx.fetch(`${ctx.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      return false
    }
    const tokens = (await res.json()) as AuthTokenPair
    await ctx.refreshToken?.onRefresh(tokens)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Core fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithRefresh(
  ctx: FetchContext,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeaders(ctx)),
    ...(init?.headers as Record<string, string> | undefined),
  }

  const res = await ctx.fetch(url, { ...init, headers })

  if (res.status !== 401 || !ctx.refreshToken) {
    return res
  }

  // Deduplicate concurrent refresh attempts
  if (!_refreshPromise) {
    _refreshPromise = attemptRefresh(ctx).finally(() => {
      _refreshPromise = null
    })
  }

  const refreshed = await _refreshPromise
  if (!refreshed) {
    return res
  }

  // Retry with new token
  const retryHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeaders(ctx)),
    ...(init?.headers as Record<string, string> | undefined),
  }

  return ctx.fetch(url, { ...init, headers: retryHeaders })
}

/**
 * Fetch JSON from the API.
 *
 * @throws {@link PandoraApiError} on non-2xx responses.
 * @internal
 */
export async function fetchJson<T>(
  ctx: FetchContext,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchWithRefresh(ctx, `${ctx.baseUrl}${path}`, init)

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new PandoraApiError(res.status, body)
  }

  return res.json() as Promise<T>
}

/**
 * Fetch a raw `Response` from the API.
 *
 * Does **not** throw on non-2xx — the caller handles the response directly.
 * Used for streaming operations where the consumer processes the SSE stream.
 *
 * @internal
 */
export async function fetchRaw(
  ctx: FetchContext,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetchWithRefresh(ctx, `${ctx.baseUrl}${path}`, init)
}
