import { describe, expect, it } from 'vitest'
import { getActiveStreamIds, getResumeStream, storeStream } from './stream-store'

/** Create a ReadableStream from an array of string chunks. */
function chunkedStream(chunks: string[]): ReadableStream<string> {
  let i = 0
  return new ReadableStream<string>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++])
      } else {
        controller.close()
      }
    },
  })
}

/** Wait a tick for microtasks to flush. */
const tick = () => new Promise((r) => setTimeout(r, 10))

describe('storeStream', () => {
  it('marks stream as active until reader completes', async () => {
    // Create a manually-controlled stream
    let closeStream!: () => void
    const manual = new ReadableStream<string>({
      start(controller) {
        closeStream = () => controller.close()
      },
    })

    storeStream('store-active', manual)
    await tick()

    expect(getActiveStreamIds()).toContain('store-active')

    closeStream()
    await tick()

    expect(getActiveStreamIds()).not.toContain('store-active')
  })

  it('replaces an existing entry for the same chatId', async () => {
    let closeFirst!: () => void
    const first = new ReadableStream<string>({
      start(controller) {
        closeFirst = () => controller.close()
      },
    })

    storeStream('store-replace', first)
    await tick()

    // Replace with a new stream
    let closeSecond!: () => void
    const second = new ReadableStream<string>({
      start(controller) {
        closeSecond = () => controller.close()
      },
    })

    storeStream('store-replace', second)
    await tick()

    // Should still be active (the new one is open)
    expect(getActiveStreamIds()).toContain('store-replace')

    closeFirst()
    closeSecond()
    await tick()
  })
})

describe('getResumeStream', () => {
  it('returns null for unknown chatId', () => {
    expect(getResumeStream('nonexistent-id')).toBeNull()
  })

  it('returns null for a completed stream', async () => {
    storeStream('resume-done', chunkedStream(['x']))
    await tick()

    // Stream completed — should not be resumable
    expect(getResumeStream('resume-done')).toBeNull()
  })

  it('replays buffered chunks then follows live chunks', async () => {
    let enqueue!: (v: string) => void
    let close!: () => void
    const manual = new ReadableStream<string>({
      start(controller) {
        enqueue = (v) => controller.enqueue(v)
        close = () => controller.close()
      },
    })

    storeStream('resume-replay', manual)
    await tick()

    // Push some chunks before getting resume
    enqueue('a')
    enqueue('b')
    await tick()

    // Get resume stream — should see buffered + future chunks
    const resume = getResumeStream('resume-replay')
    expect(resume).not.toBeNull()

    // biome-ignore lint/style/noNonNullAssertion: asserted non-null on line above
    const reader = resume!.getReader()

    // Should immediately replay buffered chunks
    expect(await reader.read()).toEqual({ done: false, value: 'a' })
    expect(await reader.read()).toEqual({ done: false, value: 'b' })

    // Push a live chunk
    enqueue('c')
    await tick()
    expect(await reader.read()).toEqual({ done: false, value: 'c' })

    // Close the source
    close()
    await tick()
    expect(await reader.read()).toEqual({ done: true, value: undefined })
  })

  it('allows cancel without error', async () => {
    let close!: () => void
    const manual = new ReadableStream<string>({
      start(controller) {
        close = () => controller.close()
      },
    })

    storeStream('resume-cancel', manual)
    await tick()

    const resume = getResumeStream('resume-cancel')
    expect(resume).not.toBeNull()

    // Cancel the resume stream
    // biome-ignore lint/style/noNonNullAssertion: asserted non-null on line above
    await resume!.cancel()

    // Cleanup
    close()
    await tick()
  })
})

describe('getActiveStreamIds', () => {
  it('only returns in-flight stream IDs', async () => {
    let closeActive!: () => void
    const active = new ReadableStream<string>({
      start(controller) {
        closeActive = () => controller.close()
      },
    })

    storeStream('ids-active', active)
    storeStream('ids-done', chunkedStream(['x']))

    // Let the done stream finish
    await tick()

    const ids = getActiveStreamIds()
    expect(ids).toContain('ids-active')
    expect(ids).not.toContain('ids-done')

    // Cleanup
    closeActive()
    await tick()
  })
})
