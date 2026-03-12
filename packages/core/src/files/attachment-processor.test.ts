import type { MastraDBMessage } from '@mastra/core/memory'
import { describe, expect, it, vi } from 'vitest'
import { createAttachmentProcessor, resolveFileUrls } from './attachment-processor'

const BASE_URL = 'http://localhost:4111'

function createMockDisk() {
  const stored = new Map<string, { buffer: Uint8Array; contentType: string }>()
  return {
    disk: {
      put: vi.fn(async (key: string, buffer: Uint8Array, opts?: { contentType?: string }) => {
        stored.set(key, { buffer, contentType: opts?.contentType ?? 'application/octet-stream' })
      }),
      getUrl: vi.fn(async (key: string) => `/api/files/${key}`),
      stored,
    } as unknown as import('flydrive').Disk,
    stored,
  }
}

function makeMessage(parts: unknown[], id = 'msg-1'): MastraDBMessage {
  return {
    id,
    role: 'user',
    content: { parts },
    createdAt: new Date(),
  } as MastraDBMessage
}

// ---------------------------------------------------------------------------
// processInputStep helper
// ---------------------------------------------------------------------------

async function processInputStep(
  disk: import('flydrive').Disk,
  messages: MastraDBMessage[],
): Promise<MastraDBMessage[]> {
  const processor = createAttachmentProcessor(disk, BASE_URL)
  const fn = processor.processInputStep
  if (!fn) throw new Error('processInputStep not defined')
  const result = await fn({
    messages,
    messageList: {} as never,
    systemMessages: [],
    state: {},
    steps: [],
    stepNumber: 0,
    model: {} as never,
    tools: {},
    toolChoice: 'auto',
    abort: () => {
      throw new Error('aborted')
    },
    retryCount: 0,
  })
  return (result as { messages: MastraDBMessage[] }).messages
}

// ---------------------------------------------------------------------------
// processOutputResult helper
// ---------------------------------------------------------------------------

async function processOutputResult(
  disk: import('flydrive').Disk,
  messages: MastraDBMessage[],
): Promise<MastraDBMessage[]> {
  const processor = createAttachmentProcessor(disk, BASE_URL)
  const fn = processor.processOutputResult
  if (!fn) throw new Error('processOutputResult not defined')
  const mockMessageList = { __mock: true } as never
  const result = await fn({
    messages,
    messageList: mockMessageList,
    state: {},
    abort: () => {
      throw new Error('aborted')
    },
    retryCount: 0,
  })
  // When no messages were modified, the processor returns the messageList
  if (result === mockMessageList) return messages
  return result as MastraDBMessage[]
}

const smallPng = 'data:image/png;base64,iVBORw0KGgo='

describe('createAttachmentProcessor', () => {
  it('has correct id', () => {
    const { disk } = createMockDisk()
    const processor = createAttachmentProcessor(disk, BASE_URL)
    expect(processor.id).toBe('attachment-processor')
  })
})

// ---------------------------------------------------------------------------
// processInputStep — upload data: URLs + resolve relative URLs
// ---------------------------------------------------------------------------

describe('processInputStep', () => {
  it('uploads data: URL file parts and resolves to absolute URL', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      { type: 'file', data: smallPng, mimeType: 'image/png', filename: 'photo.png' },
    ])

    const result = await processInputStep(disk, [msg])

    expect(disk.put).toHaveBeenCalledOnce()
    const putCall = (disk.put as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(putCall[0]).toMatch(/^attachments\/\d{4}\/\d{2}\/[a-f0-9-]+\/photo\.png$/)
    expect(putCall[2]).toEqual({ contentType: 'image/png' })

    const filePart = (result[0].content as { parts: unknown[] }).parts[0] as Record<string, unknown>
    expect(filePart.data).toMatch(/^http:\/\/localhost:4111\/api\/files\/attachments\//)
  })

  it('resolves relative /api/files/ URLs to absolute', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      {
        type: 'file',
        data: '/api/files/attachments/2026/03/abc/photo.png',
        mimeType: 'image/png',
      },
    ])

    const result = await processInputStep(disk, [msg])

    expect(disk.put).not.toHaveBeenCalled()
    const part = (result[0].content as { parts: unknown[] }).parts[0] as Record<string, unknown>
    expect(part.data).toBe('http://localhost:4111/api/files/attachments/2026/03/abc/photo.png')
  })

  it('passes through non-file parts unchanged', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([{ type: 'text', text: 'hello' }])
    const result = await processInputStep(disk, [msg])

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(msg)
    expect(disk.put).not.toHaveBeenCalled()
  })

  it('passes through absolute URLs unchanged', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      {
        type: 'file',
        data: 'https://cdn.example.com/photo.png',
        mimeType: 'image/png',
      },
    ])

    const result = await processInputStep(disk, [msg])
    expect(result[0]).toBe(msg)
  })

  it('handles multiple files in a single message', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      { type: 'text', text: 'see attached' },
      { type: 'file', data: smallPng, mimeType: 'image/png', filename: 'a.png' },
      {
        type: 'file',
        data: 'data:text/plain;base64,aGVsbG8=',
        mimeType: 'text/plain',
        filename: 'b.txt',
      },
    ])

    const result = await processInputStep(disk, [msg])

    expect(disk.put).toHaveBeenCalledTimes(2)

    const parts = (result[0].content as { parts: unknown[] }).parts
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({ type: 'text', text: 'see attached' })

    const file1 = parts[1] as Record<string, unknown>
    const file2 = parts[2] as Record<string, unknown>
    expect(file1.data).toMatch(/^http:\/\/localhost:4111\/api\/files\//)
    expect(file2.data).toMatch(/^http:\/\/localhost:4111\/api\/files\//)
  })

  it('preserves messages without content.parts', async () => {
    const { disk } = createMockDisk()
    const msg = {
      id: 'msg-1',
      role: 'assistant',
      content: { text: 'hi' },
    } as unknown as MastraDBMessage

    const result = await processInputStep(disk, [msg])
    expect(result[0]).toBe(msg)
  })
})

// ---------------------------------------------------------------------------
// processOutputResult — upload remaining data: URLs + strip absolute URLs
// ---------------------------------------------------------------------------

describe('processOutputResult', () => {
  it('uploads data: URL file parts and stores relative URLs', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      { type: 'file', data: smallPng, mimeType: 'image/png', filename: 'photo.png' },
    ])

    const result = await processOutputResult(disk, [msg])

    expect(disk.put).toHaveBeenCalledOnce()
    const filePart = (result[0].content as { parts: unknown[] }).parts[0] as Record<string, unknown>
    expect(filePart.data).toMatch(/^\/api\/files\/attachments\//)
    expect((filePart.data as string).startsWith(BASE_URL)).toBe(false)
  })

  it('strips absolute storage URLs to relative', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      {
        type: 'file',
        data: 'http://localhost:4111/api/files/attachments/2026/03/abc/photo.png',
        mimeType: 'image/png',
      },
    ])

    const result = await processOutputResult(disk, [msg])

    const part = (result[0].content as { parts: unknown[] }).parts[0] as Record<string, unknown>
    expect(part.data).toBe('/api/files/attachments/2026/03/abc/photo.png')
  })

  it('skips non-storage absolute URLs', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      {
        type: 'file',
        data: 'https://cdn.example.com/photo.png',
        mimeType: 'image/png',
      },
    ])

    const result = await processOutputResult(disk, [msg])
    expect(result[0]).toBe(msg)
  })

  it('passes through messages without file parts unchanged', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([{ type: 'text', text: 'hello' }])
    const result = await processOutputResult(disk, [msg])

    expect(result[0]).toBe(msg)
    expect(disk.put).not.toHaveBeenCalled()
  })

  it('handles multiple messages', async () => {
    const { disk } = createMockDisk()
    const msg1 = makeMessage([{ type: 'text', text: 'no files' }], 'msg-1')
    const msg2 = makeMessage(
      [{ type: 'file', data: smallPng, mimeType: 'image/png', filename: 'img.png' }],
      'msg-2',
    )

    const result = await processOutputResult(disk, [msg1, msg2])

    expect(result).toHaveLength(2)
    expect(result[0]).toBe(msg1)
    expect(result[1]).not.toBe(msg2)
    expect(disk.put).toHaveBeenCalledOnce()
  })

  it('uses default filename when none provided', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([{ type: 'file', data: smallPng, mimeType: 'image/png' }])

    await processOutputResult(disk, [msg])

    const putCall = (disk.put as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(putCall[0]).toMatch(/\/file\.png$/)
  })

  it('generates date-prefixed keys with UUID', async () => {
    const { disk } = createMockDisk()
    const msg = makeMessage([
      { type: 'file', data: smallPng, mimeType: 'image/png', filename: 'test.png' },
    ])

    await processOutputResult(disk, [msg])

    const key = (disk.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const segments = key.split('/')
    expect(segments[0]).toBe('attachments')
    expect(segments[1]).toMatch(/^\d{4}$/)
    expect(segments[2]).toMatch(/^\d{2}$/)
    expect(segments[3]).toMatch(/^[a-f0-9-]{36}$/)
    expect(segments[4]).toBe('test.png')
  })
})

// ---------------------------------------------------------------------------
// resolveFileUrls — resolve relative /api/files/ URLs to absolute
// ---------------------------------------------------------------------------

describe('resolveFileUrls', () => {
  it('resolves relative file URLs to absolute', () => {
    const msg = makeMessage([
      { type: 'file', data: '/api/files/attachments/2026/03/abc/photo.png', mimeType: 'image/png' },
    ])

    const result = resolveFileUrls([msg], BASE_URL)

    const part = (result[0].content as { parts: unknown[] }).parts[0] as Record<string, unknown>
    expect(part.data).toBe('http://localhost:4111/api/files/attachments/2026/03/abc/photo.png')
  })

  it('skips non-file-storage URLs', () => {
    const msg = makeMessage([
      { type: 'file', data: 'https://cdn.example.com/photo.png', mimeType: 'image/png' },
    ])

    const result = resolveFileUrls([msg], BASE_URL)
    expect(result[0]).toBe(msg)
  })

  it('skips text parts', () => {
    const msg = makeMessage([{ type: 'text', text: 'hello' }])

    const result = resolveFileUrls([msg], BASE_URL)
    expect(result[0]).toBe(msg)
  })
})
