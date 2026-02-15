import type { Config } from '../config'

/**
 * Abstract interface for config persistence across all storage backends.
 * Each backend implements this using its native client/driver.
 */
export interface ConfigStore {
  /** Get the current config, or null if not set */
  get(): Promise<Config | null>

  /** Save the config (full replacement) */
  set(config: Config): Promise<void>

  /** Delete the config */
  delete(): Promise<void>

  /** Initialize tables/collections if needed */
  init?(): Promise<void>

  /** Close any connections (optional cleanup) */
  close?(): Promise<void>
}

// Re-export for convenience
export type { Config }

// Document config stores (MongoDB, DynamoDB)
export { DynamoDBConfigStore, MongoDBConfigStore } from './config-stores/document'
// KV config stores (Upstash Redis)
export { RedisConfigStore } from './config-stores/kv'
// SQL config stores (LibSQL, Postgres, MSSQL)
export {
  createLibSQLConfigStore,
  createMSSQLConfigStore,
  createPostgresConfigStore,
  SQLConfigStore,
} from './config-stores/sql'
