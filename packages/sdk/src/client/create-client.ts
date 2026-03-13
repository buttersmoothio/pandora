import type { HealthResponse } from '../api-types'
import type { AuthClient } from './auth'
import { createAuthClient } from './auth'
import type { ChatClient } from './chat'
import { createChatClient } from './chat'
import type { ConfigClient } from './config'
import { createConfigClient } from './config'
import type { McpServersClient, ModelsClient, PluginsClient } from './discovery'
import { createMcpServersClient, createModelsClient, createPluginsClient } from './discovery'
import type { ClientOptions } from './fetch-wrapper'
import { buildContext } from './fetch-wrapper'
import { createHealthCheck } from './health'
import type { InboxClient } from './inbox'
import { createInboxClient } from './inbox'
import type { MemoryClient } from './memory'
import { createMemoryClient } from './memory'
import type { ScheduleClient } from './schedule'
import { createScheduleClient } from './schedule'
import type { ThreadsClient } from './threads'
import { createThreadsClient } from './threads'

/**
 * The Pandora API client — provides typed access to all server capabilities.
 *
 * Create one with {@link createClient}. The client is organized into
 * namespace objects that group related operations.
 *
 * @example
 * ```ts
 * const client = createClient({ baseUrl: 'http://localhost:4111' })
 *
 * const { threads } = await client.threads.list()
 * const config = await client.config.get()
 * const health = await client.health()
 * ```
 */
export interface PandoraClient {
  /** Check server health and authentication status (does not require authentication). */
  health(): Promise<HealthResponse>

  /** Authentication — login, sessions, and token management. */
  readonly auth: AuthClient

  /** Chat — streaming message send, tool approval, and stream resume. */
  readonly chat: ChatClient

  /** Threads — list, read, fork, and delete conversations. */
  readonly threads: ThreadsClient

  /** Config — read and update server configuration. */
  readonly config: ConfigClient

  /** Plugins — list installed plugins and their capabilities. */
  readonly plugins: PluginsClient

  /** MCP Servers — list and add Model Context Protocol servers. */
  readonly mcpServers: McpServersClient

  /** Models — list available LLM providers and models. */
  readonly models: ModelsClient

  /** Schedule — manage scheduled tasks and the heartbeat. */
  readonly schedule: ScheduleClient

  /** Inbox — read, update, and delete inbox messages. */
  readonly inbox: InboxClient

  /** Memory — working memory and observational memory. */
  readonly memory: MemoryClient
}

/**
 * Create a typed Pandora API client.
 *
 * This is a **synchronous** factory — no async init needed.
 * Safe to call at module scope.
 *
 * @param options - Client configuration. All fields are optional.
 * @returns A fully typed {@link PandoraClient} instance.
 *
 * @example
 * ```ts
 * import { createClient } from '@pandorakit/sdk/client'
 *
 * const client = createClient({
 *   baseUrl: 'http://localhost:4111',
 *   getToken: () => localStorage.getItem('pandora_token'),
 * })
 *
 * const { threads } = await client.threads.list()
 * ```
 */
export function createClient(options: ClientOptions = {}): PandoraClient {
  const ctx = buildContext(options)

  return {
    health: createHealthCheck(ctx),
    auth: createAuthClient(ctx),
    chat: createChatClient(ctx),
    threads: createThreadsClient(ctx),
    config: createConfigClient(ctx),
    plugins: createPluginsClient(ctx),
    mcpServers: createMcpServersClient(ctx),
    models: createModelsClient(ctx),
    schedule: createScheduleClient(ctx),
    inbox: createInboxClient(ctx),
    memory: createMemoryClient(ctx),
  }
}
