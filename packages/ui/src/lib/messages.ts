import type { UIMessage } from 'ai'

export interface ServerMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: UIMessage['parts']
  metadata?: Record<string, unknown>
}

/**
 * Convert server messages to UIMessages for initializing useChat.
 * Filters out system messages since they're not displayed.
 *
 * The server already returns parts in AI SDK v6 format (`type: "tool-${name}"`)
 * with pending approvals patched to `approval-requested` state, so no
 * normalisation is needed here.
 */
function isChatRole(m: ServerMessage): m is ServerMessage & { role: 'user' | 'assistant' } {
  return m.role === 'user' || m.role === 'assistant'
}

export function convertServerMessages(messages: ServerMessage[]): UIMessage[] {
  return messages.filter(isChatRole).map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts ?? ([] as UIMessage['parts']),
  }))
}
