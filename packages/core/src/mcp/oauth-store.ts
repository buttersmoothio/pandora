/**
 * Key-value store for MCP OAuth state (tokens, client info, code verifiers).
 * Keys are scoped by convention: `{serverId}:{key}` for per-server data,
 * `state:{stateValue}` for state→serverId mappings.
 */
export interface McpOAuthStore {
  init(): Promise<void>
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}
