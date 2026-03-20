import type { Mastra } from '@mastra/core'
import type { Memory } from '@mastra/memory'
import type { Context, MiddlewareHandler } from 'hono'
import { env, getRuntimeKey } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { AuthStore, Session } from '../auth/auth-store'
import { getLogger } from '../logger'

type Runtime = ReturnType<typeof getRuntimeKey>

const SERVERLESS_RUNTIMES: Runtime[] = ['workerd', 'edge-light', 'fastly']

export function isServerless(): boolean {
  return SERVERLESS_RUNTIMES.includes(getRuntimeKey())
}

export { getRuntimeKey }

import type { PandoraRuntime } from '../runtime/pandora-runtime'
import { createRuntime } from '../runtime/pandora-runtime'
import type { PluginRegistry } from '../runtime/plugin-registry'

// Bindings type for Cloudflare Workers
export interface Bindings {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

export interface Variables {
  envVars: Record<string, string | undefined>
  runtime: PandoraRuntime
  session?: Session
}

export interface Env {
  Bindings: Bindings
  Variables: Variables
}

/**
 * Helper to extract string env vars from raw env object
 */
export function extractStringEnv(raw: Record<string, unknown>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

/** Cached runtime for server mode */
let _runtime: PandoraRuntime | null = null

/** Access the cached runtime (for shutdown hooks) */
export function getCachedRuntime(): PandoraRuntime | null {
  return _runtime
}

/**
 * Create middleware that initializes PandoraRuntime on every request.
 * In server mode, the runtime is cached for the process lifetime.
 * In serverless mode, a fresh runtime is created per request.
 */
export function createRuntimeMiddleware(registry: PluginRegistry): MiddlewareHandler<Env> {
  return createMiddleware<Env>(async (c, next) => {
    const envVars = extractStringEnv(env(c))
    c.set('envVars', envVars)

    if (isServerless()) {
      getLogger(envVars).debug('[runtime] creating (serverless mode)')
      c.set('runtime', await createRuntime(registry, envVars))
    } else if (_runtime) {
      c.set('runtime', _runtime)
    } else {
      getLogger(envVars).debug('[runtime] creating (server mode)')
      _runtime = await createRuntime(registry, envVars)
      getLogger(envVars).debug('[runtime] created and cached')
      c.set('runtime', _runtime)
    }

    return next()
  })
}

// ---------------------------------------------------------------------------
// Pagination & error formatting helpers
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

/** Parse page/perPage query params with sensible defaults and bounds. */
export function parsePagination(c: Context<Env>): { page: number; perPage: number } {
  const page = Math.max(0, Number(c.req.query('page') ?? 0))
  const perPage = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? 50)))
  return { page, perPage }
}

/** Slice an array into a paginated response envelope. */
export function paginate<T>(items: T[], page: number, perPage: number): PaginatedResponse<T> {
  const start = page * perPage
  const data = items.slice(start, start + perPage)
  return { data, total: items.length, page, perPage, hasMore: start + perPage < items.length }
}

/** Format a ZodError into a structured validation error response. */
export function formatValidationError(error: {
  issues: { path: PropertyKey[]; message: string }[]
}): { error: string; issues: { path: string[]; message: string }[] } {
  return {
    error: 'validation_error',
    issues: error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
  }
}

// ---------------------------------------------------------------------------

/** Helper to get auth store from request context */
export async function getAuthStore(c: Context<Env>): Promise<AuthStore> {
  return c.var.runtime.storage.auth
}

/** Get memory from the operator agent, or throw 500 */
export async function getMemoryOrFail(
  c: Context<Env>,
): Promise<{ mastra: Mastra; memory: Memory }> {
  const { mastra } = c.var.runtime
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) {
    throw new HTTPException(500, { message: 'Memory not configured' })
  }
  return { mastra, memory: memory as Memory }
}
