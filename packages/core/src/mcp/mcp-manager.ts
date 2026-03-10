import type {
  MastraFetchLike,
  MastraMCPServerDefinition,
  OAuthClientInformation,
  OAuthTokens,
} from '@mastra/mcp'
import { MCPClient, MCPOAuthClientProvider } from '@mastra/mcp'
import type { Config } from '../config'
import { getLogger } from '../logger'
import type { ToolRecord } from '../tools/types'
import { ScopedOAuthStorage } from './oauth-adapter'
import type { McpOAuthStore } from './oauth-store'
import type { McpServerConfig, McpServerMeta } from './types'

/**
 * Narrowed tool shape for MCP tools returned by @mastra/mcp MCPClient.listTools().
 * Avoids `any` casts when accessing MCP-specific properties on the broad ToolRecord union.
 */
interface McpToolShape {
  description?: string
  mcp?: { annotations?: { title?: string; readOnlyHint?: boolean } }
  requireApproval?: boolean
}

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

/** Create a custom fetch that injects static headers. */
function createHeaderFetch(headers: Record<string, string>): MastraFetchLike {
  return (url, init) => {
    const merged = new Headers(init?.headers)
    for (const [k, v] of Object.entries(headers)) {
      merged.set(k, v)
    }
    return fetch(url, { ...init, headers: merged })
  }
}

/** Build a stdio server definition. */
function buildStdioDef(
  command: string,
  sc: McpServerConfig,
  hostEnv: Record<string, string | undefined>,
): MastraMCPServerDefinition {
  const env: Record<string, string> = {}
  for (const name of sc.env ?? []) {
    if (hostEnv[name]) env[name] = hostEnv[name]
  }
  return { command, args: sc.args ?? [], env }
}

/** Build an HTTP server definition with optional auth. */
function buildHttpDef(
  id: string,
  serverUrl: string,
  sc: McpServerConfig,
  hostEnv: Record<string, string | undefined>,
  oauthStore: McpOAuthStore | undefined,
  pendingAuthUrls: Map<string, string>,
): MastraMCPServerDefinition {
  const log = getLogger()
  const parsedUrl = new URL(serverUrl)
  const customFetch =
    sc.headers && Object.keys(sc.headers).length > 0 ? createHeaderFetch(sc.headers) : undefined

  if (sc.oauth && oauthStore) {
    const baseUrl = hostEnv.BASE_URL
    if (baseUrl) {
      return buildOAuthDef(id, parsedUrl, baseUrl, oauthStore, pendingAuthUrls, customFetch)
    }
    log.warn(`[mcp] OAuth requires BASE_URL env var, skipping OAuth for server "${id}"`)
  }

  return customFetch
    ? ({ url: parsedUrl, fetch: customFetch } as MastraMCPServerDefinition)
    : { url: parsedUrl }
}

/** Build an OAuth-enabled HTTP server definition. */
function buildOAuthDef(
  id: string,
  parsedUrl: URL,
  baseUrl: string,
  oauthStore: McpOAuthStore,
  pendingAuthUrls: Map<string, string>,
  customFetch: MastraFetchLike | undefined,
): MastraMCPServerDefinition {
  const log = getLogger()
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

  return {
    url: parsedUrl,
    authProvider,
    ...(customFetch ? { fetch: customFetch } : {}),
  } as MastraMCPServerDefinition
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
    const t = tool as McpToolShape

    const serverConfig = config.mcpServers[serverId] as McpServerConfig | undefined
    if (serverConfig?.requireApproval !== false) {
      t.requireApproval = true
    }

    tools[namespacedKey] = tool

    const meta = metas.get(serverId)
    if (meta) {
      const shortName = underscoreIdx > -1 ? namespacedKey.slice(underscoreIdx + 1) : namespacedKey
      meta.tools.push({
        id: namespacedKey,
        name: t.mcp?.annotations?.title ?? shortName,
        description: t.description ?? '',
      })
    }
  }
}

/** Build metadata for a single server config. */
function buildMeta(id: string, sc: McpServerConfig): McpServerMeta {
  return {
    id,
    name: sc.name ?? id,
    type: sc.command ? 'stdio' : 'http',
    enabled: sc.enabled ?? true,
    requireApproval: sc.requireApproval ?? true,
    tools: [],
  }
}

/** Build a server definition from config. */
function buildDef(
  id: string,
  sc: McpServerConfig,
  env: Record<string, string | undefined>,
  oauthStore: McpOAuthStore | undefined,
  pendingAuthUrls: Map<string, string>,
): MastraMCPServerDefinition | undefined {
  if (sc.command) return buildStdioDef(sc.command, sc, env)
  if (sc.url) return buildHttpDef(id, sc.url, sc, env, oauthStore, pendingAuthUrls)
  return undefined
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
    const meta = buildMeta(id, sc)

    if (!meta.enabled) {
      metas.set(id, meta)
      continue
    }

    try {
      const def = buildDef(id, sc, env, oauthStore, pendingAuthUrls)
      if (def) {
        servers[id] = def
        log.debug(`[mcp] server configured: ${id}`)
      }
      metas.set(id, meta)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`[mcp] failed to configure server ${id}`, { error: message })
      metas.set(id, { ...meta, error: message })
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

/** Exchange an authorization code for OAuth tokens via the MCP SDK. */
async function exchangeOAuthCode(
  serverUrl: string,
  callbackUrl: string,
  code: string,
  codeVerifier: string,
  clientInfo: OAuthClientInformation,
): Promise<OAuthTokens> {
  const {
    discoverOAuthProtectedResourceMetadata,
    discoverAuthorizationServerMetadata,
    exchangeAuthorization,
  } = await import('@modelcontextprotocol/sdk/client/auth.js')

  const resourceMeta = await discoverOAuthProtectedResourceMetadata(new URL(serverUrl))
  const authServerUrl = resourceMeta.authorization_servers?.[0]
  if (!authServerUrl) throw new Error('No authorization server found in resource metadata')

  const authMeta = await discoverAuthorizationServerMetadata(new URL(authServerUrl))

  return exchangeAuthorization(authServerUrl, {
    metadata: authMeta,
    clientInformation: clientInfo,
    authorizationCode: code,
    codeVerifier,
    redirectUri: callbackUrl,
    resource: new URL(serverUrl),
  })
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

      const serverId = await oauthStore.get(`state:${state}`)
      if (!serverId) throw new Error('Invalid or expired OAuth state')

      const serverConfig = config.mcpServers[serverId] as McpServerConfig | undefined
      if (!serverConfig?.url) throw new Error(`Server "${serverId}" not found or has no URL`)

      const baseUrl = env.BASE_URL
      if (!baseUrl) throw new Error('BASE_URL env var not configured')

      const callbackUrl = `${baseUrl.replace(/\/$/, '')}/oauth/mcp/callback`
      const storage = new ScopedOAuthStorage(oauthStore, serverId)

      const codeVerifier = await storage.get('code_verifier')
      const clientInfoStr = await storage.get('client_info')
      if (!codeVerifier) throw new Error('Missing code verifier — OAuth flow may have expired')
      if (!clientInfoStr) throw new Error('Missing client info — OAuth flow may have expired')

      const tokens = await exchangeOAuthCode(
        serverConfig.url,
        callbackUrl,
        code,
        codeVerifier,
        JSON.parse(clientInfoStr),
      )
      await storage.set('tokens', JSON.stringify(tokens))
      await oauthStore.delete(`state:${state}`)

      log.info(`[mcp] OAuth authorization completed for server "${serverId}"`)
      return serverId
    },
  }
}
