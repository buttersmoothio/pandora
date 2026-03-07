import type { MastraMCPServerDefinition } from '@mastra/mcp'
import { MCPClient } from '@mastra/mcp'
import type { Config } from '../config'
import { getLogger } from '../logger'
import type { ToolRecord } from '../tools/types'
import type { McpServerConfig, McpServerMeta } from './types'

export interface McpManager {
  /** All loaded MCP tools, keyed by MCPClient's namespaced ID. */
  readonly tools: ToolRecord
  /** Per-server metadata for discovery API. */
  readonly serverMeta: Map<string, McpServerMeta>
  /** Disconnect all servers. Must be called on reload/shutdown. */
  disconnect(): Promise<void>
}

/** Build a stdio or HTTP server definition. */
function buildServerDef(
  sc: McpServerConfig,
  hostEnv: Record<string, string | undefined>,
): MastraMCPServerDefinition | undefined {
  if (sc.command) {
    // Forward only declared env vars from host
    const env: Record<string, string> = {}
    for (const name of sc.env ?? []) {
      if (hostEnv[name]) env[name] = hostEnv[name]
    }
    return { command: sc.command, args: sc.args ?? [], env }
  }
  if (sc.url) {
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
function buildServers(config: Config, env: Record<string, string | undefined>) {
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
      const def = buildServerDef(sc, env)
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
}

/**
 * Create an MCP manager that connects to configured MCP servers,
 * loads their tools, and provides lifecycle management.
 */
export async function createMcpManager(
  config: Config,
  env: Record<string, string | undefined>,
): Promise<McpManager> {
  const log = getLogger()

  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    return EMPTY_MANAGER
  }

  const { servers, metas } = buildServers(config, env)

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
  }
}
