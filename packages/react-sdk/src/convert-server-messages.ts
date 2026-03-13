import type { ServerMessage } from '@pandorakit/sdk/client'
import type { UIMessage } from 'ai'

function isChatRole(m: ServerMessage): m is ServerMessage & { role: 'user' | 'assistant' } {
  return m.role === 'user' || m.role === 'assistant'
}

/** Convert server messages to UIMessages, filtering out system messages. */
export function convertServerMessages(messages: ServerMessage[]): UIMessage[] {
  return messages.filter(isChatRole).map((m) => ({
    id: m.id,
    role: m.role,
    parts: (m.parts ?? []) as UIMessage['parts'],
  }))
}
