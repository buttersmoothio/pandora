import type { UIMessage } from 'ai'

export interface ServerMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: UIMessage['parts']
}

/**
 * Convert server messages to UIMessages for initializing useChat.
 * Filters out system messages since they're not displayed.
 */
export function convertServerMessages(messages: ServerMessage[]): UIMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: m.parts ?? [],
    }))
}
