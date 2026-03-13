import type { Config, DeepPartial } from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Config client — read and update server configuration.
 *
 * Access via `client.config`.
 */
export interface ConfigClient {
  /** Get the current server configuration. */
  get(): Promise<Config>

  /**
   * Partially update the server configuration.
   *
   * Uses deep-merge semantics: set a field to `null` to delete an optional key,
   * or provide a value to update it. Unmentioned fields are left unchanged.
   *
   * @param patch - Partial configuration update.
   * @returns The full updated configuration.
   */
  update(patch: DeepPartial<Config>): Promise<Config>
}

/** @internal */
export function createConfigClient(ctx: FetchContext): ConfigClient {
  return {
    get(): Promise<Config> {
      return fetchJson(ctx, '/api/config')
    },
    update(patch: DeepPartial<Config>): Promise<Config> {
      return fetchJson(ctx, '/api/config', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
  }
}
