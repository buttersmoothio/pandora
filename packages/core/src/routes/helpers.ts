import type { Mastra } from '@mastra/core'
import type { Memory } from '@mastra/memory'
import type { Context } from 'hono'
import { env, getRuntimeKey } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { AuthStore } from '../auth/auth-store'
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
export type Bindings = {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

export type Variables = {
  envVars: Record<string, string | undefined>
  runtime: PandoraRuntime
}

export type Env = { Bindings: Bindings; Variables: Variables }

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

/**
 * Create middleware that initializes PandoraRuntime on every request.
 * In server mode, the runtime is cached for the process lifetime.
 * In serverless mode, a fresh runtime is created per request.
 */
export function createRuntimeMiddleware(registry: PluginRegistry) {
  return createMiddleware<Env>(async (c, next) => {
    const envVars = extractStringEnv(env(c))
    c.set('envVars', envVars)

    if (isServerless()) {
      getLogger(envVars).debug('Runtime: creating (serverless mode)')
      c.set('runtime', await createRuntime(registry, envVars))
    } else if (_runtime) {
      c.set('runtime', _runtime)
    } else {
      getLogger(envVars).debug('Runtime: creating (server mode)')
      _runtime = await createRuntime(registry, envVars)
      getLogger(envVars).debug('Runtime: created and cached')
      c.set('runtime', _runtime)
    }

    return next()
  })
}

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
  if (!memory) throw new HTTPException(500, { message: 'Memory not configured' })
  return { mastra, memory: memory as Memory }
}
