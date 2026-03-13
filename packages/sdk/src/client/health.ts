import type { HealthResponse } from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Creates the `health()` method for {@link PandoraClient}.
 *
 * Checks server status and authentication state.
 *
 * @internal
 */
export function createHealthCheck(ctx: FetchContext): () => Promise<HealthResponse> {
  return () => fetchJson(ctx, '/')
}
