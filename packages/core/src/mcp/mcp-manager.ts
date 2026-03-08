import type { MastraMCPServerDefinition } from '@mastra/mcp'
import { MCPClient, MCPOAuthClientProvider } from '@mastra/mcp'
import type { Config } from '../config'
import { getLogger } from '../logger'
import type { ToolRecord } from '../tools/types'
import { ScopedOAuthStorage } from './oauth-adapter'
import type { McpOAuthStore } from './oauth-store'
import type { McpServerConfig, McpServerMeta } from './types'

export interface McpManager {
  /** All loaded MCP tools, keyed by MCPClient's namespaced ID. */
  readonly tools: ToolRecord
  /** Per-server metadata for discovery API. */
  readonly serverMeta: Map<string, McpServerMeta>
  /** Disconnect all servers. Must be called on reload/shutdown. */
  disconnect(): Promise<void>
  /** Handle an OAuth callback. Returns the server ID on success. */
  handleOAuthCallback(code: string, state: string): Promise<string>
}

/** Build a stdio or HTTP server definition. */
function buildServerDef(
  id: string,
  sc: McpServerConfig,
  hostEnv: Record<string, string | undefined>,
  oauthStore: McpOAuthStore | undefined,
  pendingAuthUrls: Map<string, string>,
): MastraMCPServerDefinition | undefined {
  const log = getLogger()

  if (sc.command) {
    // Forward only declared env vars from host
    const env: Record<string, string> = {}
    for (const name of sc.env ?? []) {
      if (hostEnv[name]) env[name] = hostEnv[name]
    }
    return { command: sc.command, args: sc.args ?? [], env }
  }

  if (sc.url) {
    // Build HTTP server definition with optional auth
    const hasHeaders = sc.headers && Object.keys(sc.headers).length > 0

    // Custom fetch for static headers
    const customFetch = hasHeaders
      ? (url: string | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers)
          for (const [k, v] of Object.entries(sc.headers!)) {
            headers.set(k, v)
          }
          return fetch(url, { ...init, headers })
        }
      : undefined

    // OAuth auth provider
    if (sc.oauth && oauthStore) {
      const baseUrl = hostEnv.BASE_URL
      if (baseUrl) {
        const storage = new ScopedOAuthStorage(oauthStore, id)
        const callbackUrl = `${baseUrl.replace(/\/$/, '')}/oauth/mcp/callback`
        const authProvider = new MCPOAuthClientProvider({
          redirectUrl: callbackUrl,
          clientMetadata: {
            redirect_uris: [callbackUrl],
            client_name: 'Pandora',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
          },
          storage,
          onRedirectToAuthorization: async (url: URL) => {
            const state = url.searchParams.get('state')
            if (state) await oauthStore.set(`state:${state}`, id)
            pendingAuthUrls.set(id, url.toString())
            log.info(`[mcp] OAuth authorization required for server "${id}"`)
          },
        })

        // biome-ignore lint/suspicious/noExplicitAny: building a union type incrementally
        const def: any = { url: new URL(sc.url), authProvider }
        if (customFetch) def.fetch = customFetch
        return def as MastraMCPServerDefinition
      } else {
        log.warn(`[mcp] OAuth requires BASE_URL env var, skipping OAuth for server "${id}"`)
      }
    }

    // No OAuth — plain URL with optional headers
    if (customFetch) {
      // biome-ignore lint/suspicious/noExplicitAny: building a union type incrementally
      const def: any = { url: new URL(sc.url), fetch: customFetch }
      return def as MastraMCPServerDefinition
    }

    return { url: new URL(sc.url) }
  }

  return undefined
}

/** Register tools from MCPClient into the tool record and server metadata. */
function registerTools(
  mcpTools: ToolRecord,
  config: Config,
  metas: Map<string, McpServerMeta>,
  tools: ToolRecord,
) {
  for (const [namespacedKey, tool] of Object.entries(mcpTools)) {
    const underscoreIdx = namespacedKey.indexOf('_')
    const serverId = underscoreIdx > -1 ? namespacedKey.slice(0, underscoreIdx) : namespacedKey

    const serverConfig = config.mcpServers[serverId] as McpServerConfig | undefined
    if (serverConfig?.requireApproval !== false) {
      // biome-ignore lint/suspicious/noExplicitAny: tool shape varies
      ;(tool as any).requireApproval = true
    }

    tools[namespacedKey] = tool

    const meta = metas.get(serverId)
    if (meta) {
      const shortName = underscoreIdx > -1 ? namespacedKey.slice(underscoreIdx + 1) : namespacedKey
      meta.tools.push({
        id: namespacedKey,
        name: shortName,
        // biome-ignore lint/suspicious/noExplicitAny: tool shape varies
        description: (tool as any).description ?? '',
      })
    }
  }
}

/** Build server definitions and metadata from config. */
function buildServers(
  config: Config,
  env: Record<string, string | undefined>,
  oauthStore: McpOAuthStore | undefined,
  pendingAuthUrls: Map<string, string>,
) {
  const log = getLogger()
  const servers: Record<string, MastraMCPServerDefinition> = {}
  const metas = new Map<string, McpServerMeta>()

  for (const [id, server] of Object.entries(config.mcpServers)) {
    const sc = server as McpServerConfig
    const baseMeta: McpServerMeta = {
      id,
      name: sc.name ?? id,
      type: sc.command ? 'stdio' : 'sse',
      enabled: sc.enabled ?? true,
      requireApproval: sc.requireApproval ?? true,
      tools: [],
    }

    if (!baseMeta.enabled) {
      metas.set(id, baseMeta)
      continue
    }

    try {
      const def = buildServerDef(id, sc, env, oauthStore, pendingAuthUrls)
      if (def) {
        servers[id] = def
        log.debug(`[mcp] server configured: ${id}`)
      }
      metas.set(id, baseMeta)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`[mcp] failed to configure server ${id}`, { error: message })
      metas.set(id, { ...baseMeta, error: message })
    }
  }

  return { servers, metas }
}

const EMPTY_MANAGER: McpManager = {
  tools: {},
  serverMeta: new Map(),
  disconnect: async () => {},
  handleOAuthCallback: async () => {
    throw new Error('No MCP servers configured')
  },
}

/**
 * Create an MCP manager that connects to configured MCP servers,
 * loads their tools, and provides lifecycle management.
 */
export async function createMcpManager(
  config: Config,
  env: Record<string, string | undefined>,
  oauthStore?: McpOAuthStore,
): Promise<McpManager> {
  const log = getLogger()

  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    return EMPTY_MANAGER
  }

  const pendingAuthUrls = new Map<string, string>()
  const { servers, metas } = buildServers(config, env, oauthStore, pendingAuthUrls)

  if (Object.keys(servers).length === 0) {
    return { ...EMPTY_MANAGER, serverMeta: metas }
  }

  const client = new MCPClient({ id: 'pandora-mcp', servers })
  const tools: ToolRecord = {}

  try {
    const mcpTools = await client.listTools()
    registerTools(mcpTools, config, metas, tools)
    log.info('[mcp] loaded tools', {
      serverCount: Object.keys(servers).length,
      toolCount: Object.keys(tools).length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('[mcp] failed to load tools from MCP servers', { error: message })
  }

  // Apply pending auth URLs to server metadata
  for (const [id, authUrl] of pendingAuthUrls) {
    const meta = metas.get(id)
    if (meta) meta.authUrl = authUrl
  }

  return {
    tools,
    serverMeta: metas,
    async disconnect() {
      try {
        await client.disconnect()
        log.debug('[mcp] disconnected all servers')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        log.error('[mcp] error during disconnect', { error: message })
      }
    },
    async handleOAuthCallback(code: string, state: string): Promise<string> {
      if (!oauthStore) throw new Error('OAuth store not available')

      // Look up which server this callback is for
      const serverId = await oauthStore.get(`state:${state}`)
      if (!serverId) throw new Error('Invalid or expired OAuth state')

      const serverConfig = config.mcpServers[serverId] as McpServerConfig | undefined
      if (!serverConfig?.url) throw new Error(`Server "${serverId}" not found or has no URL`)

      const baseUrl = env.BASE_URL
      if (!baseUrl) throw new Error('BASE_URL env var not configured')

      const callbackUrl = `${baseUrl.replace(/\/$/, '')}/oauth/mcp/callback`
      const storage = new ScopedOAuthStorage(oauthStore, serverId)

      // Load code verifier and client info from storage
      const codeVerifier = await storage.get('code_verifier')
      const clientInfoStr = await storage.get('client_info')
      if (!codeVerifier) throw new Error('Missing code verifier — OAuth flow may have expired')
      if (!clientInfoStr) throw new Error('Missing client info — OAuth flow may have expired')

      const clientInfo = JSON.parse(clientInfoStr)
      const serverUrl = serverConfig.url

      // Discover OAuth metadata from the MCP server
      const { discoverOAuthProtectedResourceMetadata, discoverAuthorizationServerMetadata } =
        await import('@modelcontextprotocol/sdk/client/auth.js')

      const resourceMeta = await discoverOAuthProtectedResourceMetadata(new URL(serverUrl))
      const authServerUrl = resourceMeta.authorization_servers?.[0]
      if (!authServerUrl) throw new Error('No authorization server found in resource metadata')

      const authMeta = await discoverAuthorizationServerMetadata(new URL(authServerUrl))
      if (!authMeta) throw new Error('Could not discover authorization server metadata')
      const tokenEndpoint = authMeta.token_endpoint
      if (!tokenEndpoint)
        throw new Error('No token endpoint found in authorization server metadata')

      // Exchange authorization code for tokens
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: clientInfo.client_id,
        code_verifier: codeVerifier,
      })
      if (clientInfo.client_secret) {
        body.set('client_secret', clientInfo.client_secret)
      }

      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`)
      }

      const tokens = await tokenResponse.json()
      await storage.set('tokens', JSON.stringify(tokens))

      // Clean up state mapping
      await oauthStore.delete(`state:${state}`)

      log.info(`[mcp] OAuth authorization completed for server "${serverId}"`)
      return serverId
    },
  }
}
