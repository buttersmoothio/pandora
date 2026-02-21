import type { Memory } from '@mastra/memory'
import type { Context } from 'hono'
import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { loadChannels } from '../channels'
import { getConfig } from '../config'
import { getMastra } from '../mastra'
import { getStorage } from '../storage'

// Bindings type for Cloudflare Workers
export type Bindings = {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

export type Variables = {
  envVars: Record<string, string | undefined>
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

/** Middleware that extracts string env vars and stores them on c.var.envVars */
export const envMiddleware = createMiddleware<Env>(async (c, next) => {
  c.set('envVars', extractStringEnv(env(c)))
  return next()
})

/** Helper to get auth store from request context */
export async function getAuthStore(c: Context<Env>) {
  const { auth } = await getStorage(c.var.envVars, c.env)
  return auth
}

/** Get memory from the operator agent, or throw 500 */
export async function getMemoryOrFail(c: Context<Env>) {
  const mastra = await getMastra(c.var.envVars, c.env)
  const memory = await mastra.getAgent('operator').getMemory()
  if (!memory) throw new HTTPException(500, { message: 'Memory not configured' })
  return { mastra, memory: memory as Memory }
}

let _channelsLoaded = false

/** Ensure channels are loaded once */
export async function ensureChannelsLoaded(envVars: Record<string, string | undefined>) {
  if (_channelsLoaded) return
  const { config: configStore } = await getStorage(envVars)
  const config = await getConfig(configStore)
  await loadChannels(envVars, config.channels)
  _channelsLoaded = true
}
