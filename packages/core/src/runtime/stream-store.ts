import { getLogger } from '../logger'

interface BufferedStream {
  chunks: string[]
  done: boolean
  error: boolean
  listeners: Set<() => void>
}

const _streams: Map<string, BufferedStream> = new Map<string, BufferedStream>()

const CLEANUP_DELAY = 60_000

/**
 * Buffer an SSE stream for later resume. Fire-and-forget reader loop.
 * Replaces any existing entry for the same chatId.
 */
export function storeStream(chatId: string, sseStream: ReadableStream<string>): void {
  // Replace any prior entry
  _streams.delete(chatId)

  const entry: BufferedStream = { chunks: [], done: false, error: false, listeners: new Set() }
  _streams.set(chatId, entry)

  void drainStream(chatId, entry, sseStream)
}

async function drainStream(
  chatId: string,
  entry: BufferedStream,
  stream: ReadableStream<string>,
): Promise<void> {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      entry.chunks.push(value)
      for (const notify of entry.listeners) {
        notify()
      }
    }
  } catch (err) {
    entry.error = true
    getLogger().error('[stream-store] stream read error', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    entry.done = true
    for (const notify of entry.listeners) {
      notify()
    }
    setTimeout(() => _streams.delete(chatId), CLEANUP_DELAY)
  }
}

/**
 * Create a ReadableStream that replays buffered chunks then follows live.
 * Returns null if no entry exists.
 */
export function getResumeStream(chatId: string): ReadableStream<string> | null {
  const entry = _streams.get(chatId)
  // Only serve in-flight streams. Completed streams return null — the
  // client already has the full response via its initial messages query.
  if (!entry || entry.done) {
    return null
  }

  let cursor = 0

  let cleanup: (() => void) | undefined

  return new ReadableStream<string>({
    start(controller: ReadableStreamDefaultController<string>): void {
      const flush = () => {
        while (cursor < entry.chunks.length) {
          controller.enqueue(entry.chunks[cursor++])
        }
        if (entry.done) {
          entry.listeners.delete(flush)
          controller.close()
        }
      }

      cleanup = () => entry.listeners.delete(flush)
      entry.listeners.add(flush)
      flush()
    },
    cancel(): void {
      cleanup?.()
    },
  })
}

/**
 * Returns chatIds of streams that are still actively receiving data.
 */
export function getActiveStreamIds(): string[] {
  const ids: string[] = []
  for (const [id, entry] of _streams) {
    if (!entry.done) {
      ids.push(id)
    }
  }
  return ids
}
