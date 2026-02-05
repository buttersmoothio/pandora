/**
 * Store module - Modular message storage
 *
 * Re-exports the storage interface, backends, and a factory function
 * that creates the correct store based on configuration.
 */

export type { IMessageStore } from "./types";
export { MemoryStore } from "./memory";
export { SqliteStore } from "./sqlite";

import type { IMessageStore } from "./types";
import type { StorageConfig } from "../core/config";
import { MemoryStore } from "./memory";
import { SqliteStore } from "./sqlite";

/**
 * Create a message store from storage config.
 *
 * @param config - Storage config (`type`: `"memory"` or `"sqlite"`, optional `path` for SQLite).
 * @returns Store instance implementing {@link IMessageStore}.
 * @throws {Error} If `config.type` is unknown.
 */
export function createStore(config: StorageConfig): IMessageStore {
  switch (config.type) {
    case "memory":
      return new MemoryStore();
    case "sqlite":
      return new SqliteStore(config.path);
    default:
      throw new Error(`Unknown store type: ${(config as { type: string }).type}`);
  }
}
