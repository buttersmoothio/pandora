import type { UIMessage } from 'ai'

/**
 * Mastra DB message shape as returned by the /api/threads/:id endpoint.
 * The `content` field contains format version + parts array.
 */
export interface MastraDBMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  createdAt: string
  content: {
    format: number
    parts: UIMessage['parts']
  }
}

/**
 * Convert Mastra DB messages to AI SDK UIMessages for initializing useChat.
 * Filters out system messages since they're not displayed.
 */
export function convertMastraMessages(messages: MastraDBMessage[]): UIMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: m.content?.parts ?? [],
    }))
}
