import type { MastraDBMessage } from '@mastra/core/memory'
import type {
  InputProcessor,
  OutputProcessor,
  ProcessInputStepArgs,
  ProcessOutputResultArgs,
} from '@mastra/core/processors'
import type { Disk } from 'flydrive'
import mime from 'mime'
import { getLogger } from '../logger'

const FILE_URL_PREFIX = '/api/files/'

/**
 * Generate a unique storage key for an attachment.
 * Format: attachments/YYYY/MM/<uuid>/<filename>
 */
function generateKey(filename?: string, mimeType?: string): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const id = crypto.randomUUID()
  const ext = mimeType ? mime.getExtension(mimeType) : null
  const name = filename || (ext ? `file.${ext}` : 'file')
  return `attachments/${yyyy}/${mm}/${id}/${name}`
}

/**
 * Parse a data: URL into its binary content and MIME type.
 * Returns null if the URL is not a valid data URL.
 */
function parseDataUrl(url: string): { buffer: Uint8Array; mimeType: string } | null {
  const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/)
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const base64 = match[2]
  const buffer = Buffer.from(base64, 'base64')
  return { buffer, mimeType }
}

/**
 * MastraDBMessage file parts use `{ type: 'file', data: string, mimeType: string }`.
 */
interface FilePart {
  type: 'file'
  data: string
  mimeType?: string
  filename?: string
  [key: string]: unknown
}

function isFilePart(part: unknown): part is FilePart {
  if (typeof part !== 'object' || part === null) return false
  const record = part as Record<string, unknown>
  return record.type === 'file' && typeof record.data === 'string'
}

function isUploadable(part: FilePart): boolean {
  return part.data.startsWith('data:')
}

async function uploadPart(
  part: FilePart,
  disk: Disk,
  log: ReturnType<typeof getLogger>,
): Promise<FilePart> {
  const parsed = parseDataUrl(part.data)
  if (!parsed) return part

  const key = generateKey(part.filename, parsed.mimeType)
  try {
    await disk.put(key, parsed.buffer, { contentType: parsed.mimeType })
    const storageUrl = await disk.getUrl(key)
    log.debug('[attachment-processor] uploaded', { key })
    return { ...part, data: storageUrl }
  } catch (err) {
    log.error('[attachment-processor] upload failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    })
    return part
  }
}

async function uploadMessageAttachments(
  msg: MastraDBMessage,
  disk: Disk,
  log: ReturnType<typeof getLogger>,
): Promise<MastraDBMessage> {
  const parts = msg.content?.parts
  if (!Array.isArray(parts)) return msg

  let modified = false
  const newParts = await Promise.all(
    parts.map(async (part: unknown) => {
      if (!(isFilePart(part) && isUploadable(part))) return part
      modified = true
      return uploadPart(part, disk, log)
    }),
  )

  return modified ? { ...msg, content: { ...msg.content, parts: newParts } } : msg
}

// ---------------------------------------------------------------------------
// URL resolution — relative storage URLs → absolute
// ---------------------------------------------------------------------------

function resolveMessageUrls(msg: MastraDBMessage, baseUrl: string): MastraDBMessage {
  const parts = msg.content?.parts
  if (!Array.isArray(parts)) return msg

  let modified = false
  const newParts = parts.map((part: unknown) => {
    if (!(isFilePart(part) && part.data.startsWith(FILE_URL_PREFIX))) return part
    modified = true
    return { ...part, data: `${baseUrl}${part.data}` }
  })

  return modified ? { ...msg, content: { ...msg.content, parts: newParts } } : msg
}

function stripBaseUrlFromMessage(msg: MastraDBMessage, baseUrl: string): MastraDBMessage {
  const prefix = `${baseUrl}${FILE_URL_PREFIX}`
  const parts = msg.content?.parts
  if (!Array.isArray(parts)) return msg

  let modified = false
  const newParts = parts.map((part: unknown) => {
    if (!(isFilePart(part) && part.data.startsWith(prefix))) return part
    modified = true
    return { ...part, data: part.data.slice(baseUrl.length) }
  })

  return modified ? { ...msg, content: { ...msg.content, parts: newParts } } : msg
}

/**
 * Resolve relative `/api/files/...` URLs in DB messages to absolute URLs.
 * Needed before `toUIMessage` which uses `new URL()` to validate file URLs.
 */
export function resolveFileUrls(messages: MastraDBMessage[], baseUrl: string): MastraDBMessage[] {
  return messages.map((msg) => resolveMessageUrls(msg, baseUrl))
}

/**
 * Create a processor that handles file attachment lifecycle:
 *
 * - **Input** (`processInputStep`): Uploads data: URL files to storage and
 *   resolves relative `/api/files/...` URLs to absolute so Mastra can
 *   download them for the LLM.
 *
 * - **Output** (`processOutputResult`): Uploads any remaining data: URLs
 *   and strips absolute storage URLs back to relative for portable DB storage.
 */
export function createAttachmentProcessor(
  disk: Disk,
  baseUrl: string,
): InputProcessor & OutputProcessor {
  const log = getLogger()

  return {
    id: 'attachment-processor',

    async processInputStep({
      messages,
    }: ProcessInputStepArgs): Promise<{ messages: MastraDBMessage[] }> {
      const uploaded = await Promise.all(
        messages.map((msg) => uploadMessageAttachments(msg, disk, log)),
      )
      const resolved = uploaded.map((msg) => resolveMessageUrls(msg, baseUrl))
      return { messages: resolved }
    },

    async processOutputResult({ messages }: ProcessOutputResultArgs): Promise<MastraDBMessage[]> {
      const uploaded = await Promise.all(
        messages.map((msg) => uploadMessageAttachments(msg, disk, log)),
      )
      return uploaded.map((msg) => stripBaseUrlFromMessage(msg, baseUrl))
    },
  }
}
