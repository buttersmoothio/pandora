interface BufferedStream {
  chunks: string[]
  done: boolean
  error: boolean
  listeners: Set<() => void>
}

const streams = new Map<string, BufferedStream>()

const CLEANUP_DELAY = 60_000

/**
 * Buffer an SSE stream for later resume. Fire-and-forget reader loop.
 * Replaces any existing entry for the same chatId.
 */
export function storeStream(chatId: string, sseStream: ReadableStream<string>): void {
  // Replace any prior entry
  streams.delete(chatId)

  const entry: BufferedStream = { chunks: [], done: false, error: false, listeners: new Set() }
  streams.set(chatId, entry)

  const reader = sseStream.getReader()

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        entry.chunks.push(value)
        for (const notify of entry.listeners) notify()
      }
    } catch {
      entry.error = true
    } finally {
      entry.done = true
      for (const notify of entry.listeners) notify()
      setTimeout(() => streams.delete(chatId), CLEANUP_DELAY)
    }
  })()
}

/**
 * Create a ReadableStream that replays buffered chunks then follows live.
 * Returns null if no entry exists.
 */
export function getResumeStream(chatId: string): ReadableStream<string> | null {
  const entry = streams.get(chatId)
  if (!entry) return null

  let cursor = 0

  // Already completed — replay all buffered chunks immediately
  if (entry.done) {
    return new ReadableStream<string>({
      start(controller) {
        for (const chunk of entry.chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })
  }

  let cleanup: (() => void) | undefined

  return new ReadableStream<string>({
    start(controller) {
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
    cancel() {
      cleanup?.()
    },
  })
}

/**
 * Returns chatIds of streams that are still actively receiving data.
 */
export function getActiveStreamIds(): string[] {
  const ids: string[] = []
  for (const [id, entry] of streams) {
    if (!entry.done) ids.push(id)
  }
  return ids
}
