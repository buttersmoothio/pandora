// SES lockdown — must run before any other code
import './ses-lockdown'

import { handleChatStream } from '@mastra/ai-sdk'
import { AIV5Adapter } from '@mastra/core/agent/message-list'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import type { Memory } from '@mastra/memory'
import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from 'ai'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import pkg from '../package.json'
import { authMiddleware } from './auth/middleware'
import { createRateLimiter } from './auth/rate-limit'
import { createAuthRoutes, extractBearerToken } from './auth/routes'
import { getAllChannels, getChannel, handleWebhook, loadChannels, verifyWebhook } from './channels'
import { createChannelRuntime } from './channels/runtime'
import { clearConfigCache, getConfig, resetConfig, updateConfig } from './config'
import { getRuntimeKey, isServerless } from './env'
import { getLogger } from './logger'
import { clearMastraCache, getMastra } from './mastra'
import { getStorage } from './storage'
import { getActiveStreamIds, getResumeStream, storeStream } from './stream-store'
import { ensureStdlibImported, getAllManifests } from './tools'

// Bindings type for Cloudflare Workers
type Bindings = {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

// Create Hono app
const app = new Hono<{ Bindings: Bindings }>()

// Middleware
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const envVars = extractStringEnv(env(c))
      const corsOrigins = envVars.CORS_ORIGINS

      if (corsOrigins === '*') return origin

      const allowed = new Set<string>()

      // FRONTEND_URL is always allowed if set
      if (envVars.FRONTEND_URL) allowed.add(envVars.FRONTEND_URL)

      if (corsOrigins) {
        // Explicit origins override the default
        for (const o of corsOrigins.split(',')) {
          const trimmed = o.trim()
          if (trimmed) allowed.add(trimmed)
        }
      } else if (!envVars.FRONTEND_URL) {
        // Default: allow the bundled UI
        allowed.add('http://localhost:3000')
      }

      return allowed.has(origin) ? origin : ''
    },
    exposeHeaders: ['X-Thread-Id'],
  }),
)

// Health check - returns runtime info + auth state
app.get('/', async (c) => {
  let authState = { setup: false, authenticated: false }
  try {
    const envVars = extractStringEnv(env(c))
    const { auth: authStore } = await getStorage(envVars, c.env)
    const credential = await authStore.getCredential()
    const isSetup = !!credential

    let authenticated = false
    if (isSetup) {
      const token = extractBearerToken(c)
      if (token) {
        const { verifySessionToken } = await import('./auth/session')
        const session = await verifySessionToken(authStore, token)
        authenticated = !!session
      }
    }

    authState = { setup: isSetup, authenticated }
  } catch {
    // If storage fails, return default auth state
  }

  return c.json({
    name: 'Pandora',
    version: pkg.version,
    runtime: getRuntimeKey(),
    serverless: isServerless(),
    auth: authState,
  })
})

/**
 * Helper to extract string env vars from raw env object
 */
function extractStringEnv(raw: Record<string, unknown>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

/** Helper to get auth store from request context */
async function getAuthStore(c: unknown) {
  const envVars = extractStringEnv(env(c as never))
  const bindings = (c as { env: Bindings }).env
  const { auth } = await getStorage(envVars, bindings)
  return auth
}

// ---------------------------------------------------------------------------
// Channel webhook route — BEFORE auth middleware so platforms can POST freely
// ---------------------------------------------------------------------------

let _channelsLoaded = false

/** Ensure channels are loaded once */
async function ensureChannelsLoaded(envVars: Record<string, string | undefined>) {
  if (_channelsLoaded) return
  const { config: configStore } = await getStorage(envVars)
  const config = await getConfig(configStore)
  await loadChannels(envVars, config.channels)
  _channelsLoaded = true
}

app.use('/wh/*', createRateLimiter({ max: 60, windowMs: 60_000 }))

app.all('/wh/:channel', async (c) => {
  const log = getLogger()
  const channelId = c.req.param('channel')

  try {
    const envVars = extractStringEnv(env(c))
    await ensureChannelsLoaded(envVars)

    const adapter = getChannel(channelId)
    if (!adapter?.webhook) {
      return c.json({ error: 'Channel not found or has no webhook support' }, 404)
    }

    // Verify signature BEFORE constructing runtime
    const verified = await verifyWebhook(channelId, c.req.raw, envVars)
    if (!verified) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const mastra = await getMastra(envVars, c.env)
    const runtime = createChannelRuntime({ mastra, env: envVars })
    const response = handleWebhook(channelId, c.req.raw, runtime)

    if (!response) {
      return c.json({ error: 'Channel webhook handler unavailable' }, 404)
    }

    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error(`Webhook error for channel ${channelId}`, { error: message })
    return c.json({ error: message }, 500)
  }
})

// Rate limiting on auth endpoints
app.use('/api/auth/login', createRateLimiter({ max: 5, windowMs: 60_000 }))
app.use('/api/auth/setup', createRateLimiter({ max: 3, windowMs: 60_000 }))
app.use('/api/auth/refresh', createRateLimiter({ max: 10, windowMs: 60_000 }))
app.use('/api/auth/change-password', createRateLimiter({ max: 3, windowMs: 60_000 }))

// Auth middleware — protects all /api/* routes
app.use('/api/*', authMiddleware(getAuthStore))

// Auth routes
app.route('/api/auth', createAuthRoutes(getAuthStore))

// Config endpoint - get current config
app.get('/api/config', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await getConfig(configStore)
  return c.json(config)
})

// Config endpoint - update config
app.patch('/api/config', async (c) => {
  const log = getLogger()
  try {
    const envVars = extractStringEnv(env(c))
    const { config: configStore } = await getStorage(envVars, c.env)
    const patch = await c.req.json()
    const updated = await updateConfig(configStore, patch)
    // Invalidate Mastra cache so next request rebuilds with new config
    clearConfigCache()
    clearMastraCache()
    log.info('Config updated', { keys: Object.keys(patch) })
    return c.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      log.error('Config validation failed', { issues: messages })
      return c.json({ error: messages.join(', ') }, 400)
    }
    const message = err instanceof Error ? err.message : 'Invalid config'
    log.error('Config update failed', { error: message })
    return c.json({ error: message }, 400)
  }
})

// Config endpoint - reset to defaults
app.delete('/api/config', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await resetConfig(configStore)
  return c.json(config)
})

// Tools endpoint - returns all stdlib tools with manifests merged with config state
app.get('/api/tools', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await getConfig(configStore)

  await ensureStdlibImported()
  const manifests = getAllManifests()

  const tools = Object.values(manifests).map((manifest) => {
    const toolConfig = config.tools[manifest.id]
    return {
      ...manifest,
      enabled: toolConfig?.enabled ?? false,
      requireApproval: toolConfig?.requireApproval,
      settings: toolConfig?.settings,
    }
  })

  return c.json({ tools })
})

// Models endpoint - returns available providers and models
app.get('/api/models', (c) => {
  const envVars = extractStringEnv(env(c))
  const providers = Object.entries(PROVIDER_REGISTRY).map(([id, config]) => {
    const keys = Array.isArray(config.apiKeyEnvVar) ? config.apiKeyEnvVar : [config.apiKeyEnvVar]
    const configured = keys.some((key) => !!envVars[key])
    return {
      id,
      name: config.name,
      models: config.models,
      configured,
      docUrl: config.docUrl,
      gateway: config.gateway,
      envVars: keys,
    }
  })
  return c.json({ providers })
})

// Channels endpoint - returns loaded channels with status
app.get('/api/channels', async (c) => {
  const envVars = extractStringEnv(env(c))
  await ensureChannelsLoaded(envVars)

  const channels = getAllChannels().map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    webhook: !!adapter.webhook,
    realtime: !!adapter.realtime,
  }))

  return c.json({ channels })
})

// Chat endpoint - thread-based streaming
app.post('/api/chat', async (c) => {
  const log = getLogger()
  try {
    const body = await c.req.json()

    // Accept { parts, threadId? } — server wraps into messages + memory config
    const { parts, threadId: clientThreadId } = body
    if (!Array.isArray(parts) || parts.length === 0) {
      return c.json({ error: 'parts must be a non-empty array' }, 400)
    }

    const threadId = clientThreadId ?? crypto.randomUUID()

    log.info('Chat request received', { threadId, partsCount: parts.length })
    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)

    // Mark new conversations as root threads for fork filtering
    if (!clientThreadId) {
      const memory = await mastra.getAgent('operator').getMemory()
      if (memory) {
        await memory.createThread({ resourceId: 'default', threadId, metadata: { root: true } })
      }
    }

    const params = {
      messages: [{ id: crypto.randomUUID(), role: 'user' as const, parts }],
      memory: {
        thread: threadId,
        resource: 'default',
      },
    }

    const stream = await handleChatStream({
      mastra,
      agentId: 'operator',
      params,
      sendReasoning: true,
      sendSources: true,
    })

    log.debug('Chat stream created', { threadId })
    const res = createUIMessageStreamResponse({
      stream,
      ...(!isServerless() && {
        consumeSseStream: ({ stream: sseStream }) => {
          storeStream(threadId, sseStream)
        },
      }),
    })
    res.headers.set('X-Thread-Id', threadId)
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Chat request failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// Resume stream endpoint — AI SDK sends GET /api/chat/{threadId}/stream when resume: true
app.get('/api/chat/:threadId/stream', (c) => {
  if (isServerless()) return c.body(null, 204)
  const stream = getResumeStream(c.req.param('threadId'))
  if (!stream) return c.body(null, 204)
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    status: 200,
    headers: UI_MESSAGE_STREAM_HEADERS,
  })
})

/** Compute fork/branch info for a thread */
type BranchRef = { id: string; title?: string }
type ForkInfo = { sourceThreadId: string; forkPointIndex: number; siblings: BranchRef[] }

/** Map clones to fork-point message IDs using explicit forkPointMessageId metadata. */
function buildForksMap(clones: Awaited<ReturnType<Memory['listClones']>>) {
  const forks: Record<string, BranchRef[]> = {}
  for (const clone of clones) {
    const forkPointId = clone.metadata?.forkPointMessageId
    if (typeof forkPointId !== 'string') continue
    if (!forks[forkPointId]) forks[forkPointId] = []
    forks[forkPointId].push({ id: clone.id, title: clone.title ?? undefined })
  }
  return forks
}

/** If the thread is a fork, compute source info and siblings. */
async function buildForkInfo(
  mem: Memory,
  threadId: string,
  rawThread: { metadata?: Record<string, unknown> },
): Promise<ForkInfo | null> {
  const cloneMeta = mem.getCloneMetadata(rawThread as Parameters<typeof mem.getCloneMetadata>[0])
  if (!cloneMeta) return null

  const { sourceThreadId, lastMessageId } = cloneMeta
  const { messages: sourceMessages } = await mem.recall({
    threadId: sourceThreadId,
    resourceId: 'default',
  })
  // Filter to user+assistant only to match what the UI displays
  const chatMessages = sourceMessages.filter((m) => m.role === 'user' || m.role === 'assistant')
  const lastIdx = lastMessageId ? chatMessages.findIndex((m) => m.id === lastMessageId) : -1
  const forkPointIndex = lastIdx === -1 ? 0 : lastIdx + 1

  const sourceClones = await mem.listClones(sourceThreadId)
  const siblings = sourceClones
    .filter((s) => {
      const meta = mem.getCloneMetadata(s)
      return meta?.lastMessageId === lastMessageId && s.id !== threadId
    })
    .map((s) => ({ id: s.id, title: s.title ?? undefined }))

  return { sourceThreadId, forkPointIndex, siblings }
}

async function computeBranchInfo(
  mem: Memory,
  threadId: string,
  rawThread: { metadata?: Record<string, unknown> },
) {
  const clones = await mem.listClones(threadId)
  const forks = buildForksMap(clones)
  const forkInfo = await buildForkInfo(mem, threadId, rawThread)
  return { forks, forkInfo }
}

// Thread endpoints
app.get('/api/threads', async (c) => {
  const log = getLogger()
  try {
    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)
    const memory = await mastra.getAgent('operator').getMemory()
    if (!memory) {
      return c.json({ error: 'Memory not configured' }, 500)
    }

    const result = await memory.listThreads({
      filter: { resourceId: 'default', metadata: { root: true } },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    })

    // Enrich each root thread with its latest active branch
    const enriched = await Promise.all(
      result.threads.map(async (root) => {
        const clones = await (memory as Memory).listClones(root.id)
        const all = [root, ...clones]
        const latest = all.reduce((a, b) => (new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a))
        const { resourceId: _, ...thread } = root
        return {
          ...thread,
          activeThreadId: latest.id,
          threadIds: all.map((t) => t.id),
        }
      }),
    )

    return c.json({
      ...result,
      threads: enriched,
      activeStreamIds: isServerless() ? [] : getActiveStreamIds(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('List threads failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

app.get('/api/threads/:id', async (c) => {
  const log = getLogger()
  try {
    const threadId = c.req.param('id')
    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)
    const memory = await mastra.getAgent('operator').getMemory()
    if (!memory) {
      return c.json({ error: 'Memory not configured' }, 500)
    }

    const rawThread = await memory.getThreadById({ threadId })
    if (!rawThread) {
      return c.json({ error: 'Thread not found' }, 404)
    }

    const { resourceId: _, ...thread } = rawThread

    const { messages: rawMessages } = await memory.recall({
      threadId,
      resourceId: 'default',
    })

    const messages = rawMessages.map((m) => AIV5Adapter.toUIMessage(m))

    const { forks, forkInfo } = await computeBranchInfo(memory as Memory, threadId, rawThread)

    return c.json({ thread, messages, forks, forkInfo })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Get thread failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

app.post('/api/threads/:id/fork', async (c) => {
  const log = getLogger()
  try {
    const threadId = c.req.param('id')
    const { messageId } = await c.req.json()
    if (!messageId || typeof messageId !== 'string') {
      return c.json({ error: 'messageId is required' }, 400)
    }

    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)
    const memory = await mastra.getAgent('operator').getMemory()
    if (!memory) {
      return c.json({ error: 'Memory not configured' }, 500)
    }

    const { messages } = await memory.recall({ threadId, resourceId: 'default' })
    const messageIndex = messages.findIndex((m) => m.id === messageId)
    if (messageIndex === -1) {
      return c.json({ error: 'Message not found in thread' }, 404)
    }

    // Collect message IDs before the fork point
    const messageIds = messages.slice(0, messageIndex).map((m) => m.id)

    const mem = memory as Memory
    const { thread: clonedThread, clonedMessages } = await mem.cloneThread({
      sourceThreadId: threadId,
      metadata: { forkPointMessageId: messageId },
      ...(messageIds.length > 0 && {
        options: { messageFilter: { messageIds } },
      }),
    })

    const { resourceId: _, ...thread } = clonedThread

    return c.json({ thread, clonedMessageCount: clonedMessages.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Fork thread failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

app.delete('/api/threads/:id', async (c) => {
  const log = getLogger()
  try {
    const threadId = c.req.param('id')
    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)
    const memory = await mastra.getAgent('operator').getMemory()
    if (!memory) {
      return c.json({ error: 'Memory not configured' }, 500)
    }

    const thread = await memory.getThreadById({ threadId })
    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404)
    }

    await memory.deleteThread(threadId)
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Delete thread failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404)
})

// Error handler
app.onError((err, c) => {
  const log = getLogger()
  log.error('Unhandled error', { error: err.message, path: c.req.path })
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500,
  )
})

export default app
export { app }
