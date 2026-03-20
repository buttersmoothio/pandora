import type {
  AddMcpServerInput,
  McpServerInfo,
  ProviderInfo,
  UnifiedPluginInfo,
} from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Plugins client — list installed plugins and their capabilities.
 *
 * Access via `client.plugins`.
 */
export interface PluginsClient {
  /** List all plugins with their tools, agents, channels, and configuration status. */
  list(): Promise<{ data: UnifiedPluginInfo[] }>
}

/**
 * MCP servers client — list and add Model Context Protocol servers.
 *
 * Access via `client.mcpServers`.
 */
export interface McpServersClient {
  /** List all configured MCP servers with their tools and connection status. */
  list(): Promise<{ data: McpServerInfo[] }>

  /**
   * Add a new MCP server.
   * @param config - Server configuration (stdio command or HTTP URL).
   * @returns The generated server ID.
   * @throws {@link PandoraApiError} with status `400` on validation errors.
   */
  add(config: AddMcpServerInput): Promise<{ id: string }>
}

/**
 * Models client — list available LLM providers and models.
 *
 * Access via `client.models`.
 */
export interface ModelsClient {
  /** List all registered LLM providers with their available models and configuration status. */
  list(): Promise<{ data: ProviderInfo[] }>
}

/** @internal */
export function createPluginsClient(ctx: FetchContext): PluginsClient {
  return {
    list(): Promise<{ data: UnifiedPluginInfo[] }> {
      return fetchJson(ctx, '/api/plugins')
    },
  }
}

/** @internal */
export function createMcpServersClient(ctx: FetchContext): McpServersClient {
  return {
    list(): Promise<{ data: McpServerInfo[] }> {
      return fetchJson(ctx, '/api/mcp-servers')
    },
    add(config: AddMcpServerInput): Promise<{ id: string }> {
      return fetchJson(ctx, '/api/mcp-servers', {
        method: 'POST',
        body: JSON.stringify(config),
      })
    },
  }
}

/** @internal */
export function createModelsClient(ctx: FetchContext): ModelsClient {
  return {
    list(): Promise<{ data: ProviderInfo[] }> {
      return fetchJson(ctx, '/api/models')
    },
  }
}
