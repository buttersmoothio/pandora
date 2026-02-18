/**
 * Abstract interface for config persistence across all storage backends.
 * Each backend implements this using its native client/driver.
 *
 * Generic parameter `T` lets typed consumers avoid casts after retrieval.
 * Defaults to `unknown` so unparameterized usages still compile.
 */
export interface ConfigStore<T = unknown> {
  /** Get the current config, or null if not set */
  get(): Promise<T | null>

  /** Save the config (full replacement) */
  set(config: T): Promise<void>

  /** Delete the config */
  delete(): Promise<void>

  /** Initialize tables/collections if needed */
  init?(): Promise<void>

  /** Close any connections (optional cleanup) */
  close?(): Promise<void>
}
