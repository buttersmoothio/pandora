import type { OAuthStorage } from '@mastra/mcp'
import type { McpOAuthStore } from './oauth-store'

/**
 * Wraps the shared McpOAuthStore to implement Mastra's OAuthStorage interface,
 * scoped to a specific MCP server ID.
 */
export class ScopedOAuthStorage implements OAuthStorage {
  constructor(
    private store: McpOAuthStore,
    private serverId: string,
  ) {}

  async get(key: string): Promise<string | undefined> {
    return this.store.get(`${this.serverId}:${key}`)
  }

  async set(key: string, value: string): Promise<void> {
    await this.store.set(`${this.serverId}:${key}`, value)
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(`${this.serverId}:${key}`)
  }
}
