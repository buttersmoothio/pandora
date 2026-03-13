import { AIV5Adapter } from '@mastra/core/agent/message-list'
import type { Memory } from '@mastra/memory'
import type { UIMessage } from 'ai'
import { Hono } from 'hono'
import { resolveFileUrls } from '../files/attachment-processor'
import { getLogger } from '../logger'
import type { Env } from './helpers'
import { getMemoryOrFail, isServerless } from './helpers'

/** Compute fork/branch info for a thread */
interface BranchRef {
  id: string
  title?: string
}
interface ForkInfo {
  sourceThreadId: string
  forkPointIndex: number
  siblings: BranchRef[]
}

/** Map clones to fork-point message IDs using explicit forkPointMessageId metadata. */
function buildForksMap(
  clones: Awaited<ReturnType<Memory['listClones']>>,
): Record<string, BranchRef[]> {
  const forks: Record<string, BranchRef[]> = {}
  for (const clone of clones) {
    const forkPointId = clone.metadata?.forkPointMessageId
    if (typeof forkPointId !== 'string') {
      continue
    }
    if (!forks[forkPointId]) {
      forks[forkPointId] = []
    }
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
  if (!cloneMeta) {
    return null
  }

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
): Promise<{ forks: Record<string, BranchRef[]>; forkInfo: ForkInfo | null }> {
  const clones = await mem.listClones(threadId)
  const forks = buildForksMap(clones)
  const forkInfo = await buildForkInfo(mem, threadId, rawThread)
  return { forks, forkInfo }
}

const threadRoutes: Hono<Env> = new Hono<Env>()

threadRoutes.get('/', async (c) => {
  const log = getLogger()
  try {
    const { memory } = await getMemoryOrFail(c)

    const result = await memory.listThreads({
      filter: { resourceId: 'default', metadata: { root: true } },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    })

    // Enrich each root thread with its latest active branch
    const enriched = await Promise.all(
      result.threads.map(async (root) => {
        const clones = await memory.listClones(root.id)
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
      activeStreamIds: isServerless() ? [] : c.var.runtime.streams.getActiveIds(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('[threads] list failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

threadRoutes.get('/:id', async (c) => {
  const log = getLogger()
  try {
    const threadId = c.req.param('id')
    const { memory } = await getMemoryOrFail(c)

    const rawThread = await memory.getThreadById({ threadId })
    if (!rawThread) {
      return c.json({ error: 'Thread not found' }, 404)
    }

    const { resourceId: _, ...thread } = rawThread

    const { messages: rawMessages } = await memory.recall({
      threadId,
      resourceId: 'default',
    })

    // Resolve relative /api/files/ URLs to absolute before toUIMessage,
    // which uses new URL() and rejects relative paths.
    const baseUrl = c.var.envVars.BASE_URL ?? `http://localhost:${c.var.envVars.PORT ?? '4111'}`
    const resolved = resolveFileUrls(rawMessages, baseUrl)

    const messages = resolved.map((m) => {
      const uiMsg = AIV5Adapter.toUIMessage(m)

      // Mastra sets `pendingToolApprovals` metadata when the agent is suspended
      // awaiting approval. Patch matching tool parts to `approval-requested`
      // so the approve/deny buttons render immediately on page load.
      const pendingMap = uiMsg.metadata?.pendingToolApprovals as
        | Record<string, { toolCallId: string; runId: string }>
        | undefined
      if (pendingMap) {
        const pending = Object.values(pendingMap)
        uiMsg.parts = uiMsg.parts.map((part: UIMessage['parts'][number]) => {
          if (
            'toolCallId' in part &&
            part.type.startsWith('tool-') &&
            'state' in part &&
            part.state === 'input-available'
          ) {
            const approval = pending.find((a) => a.toolCallId === part.toolCallId)
            if (approval) {
              return { ...part, state: 'approval-requested', approval: { id: approval.runId } }
            }
          }
          return part
        })
      }
      return uiMsg
    })

    const { forks, forkInfo } = await computeBranchInfo(memory, threadId, rawThread)

    return c.json({ thread, messages, forks, forkInfo })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('[threads] get failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

threadRoutes.post('/:id/fork', async (c) => {
  const log = getLogger()
  try {
    const threadId = c.req.param('id')
    const { messageId } = await c.req.json<{ messageId?: string }>()
    if (!messageId || typeof messageId !== 'string') {
      return c.json({ error: 'messageId is required' }, 400)
    }

    const { memory } = await getMemoryOrFail(c)

    const { messages } = await memory.recall({ threadId, resourceId: 'default' })
    const messageIndex = messages.findIndex((m) => m.id === messageId)
    if (messageIndex === -1) {
      return c.json({ error: 'Message not found in thread' }, 404)
    }

    // Collect message IDs before the fork point
    const messageIds = messages.slice(0, messageIndex).map((m) => m.id)

    const { thread: clonedThread, clonedMessages } = await memory.cloneThread({
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
    log.error('[threads] fork failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

threadRoutes.delete('/:id', async (c) => {
  const log = getLogger()
  try {
    const threadId = c.req.param('id')
    const { memory } = await getMemoryOrFail(c)

    const thread = await memory.getThreadById({ threadId })
    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404)
    }

    await memory.deleteThread(threadId)
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('[threads] delete failed', { error: message })
    return c.json({ error: message }, 500)
  }
})

export { threadRoutes }
