import type { ServerMessage } from '@pandorakit/sdk/client'
import { describe, expect, it } from 'vitest'
import { convertServerMessages } from '../convert-server-messages'

describe('convertServerMessages', () => {
  it('filters out system messages', () => {
    const messages: ServerMessage[] = [
      { id: '1', role: 'system', parts: [{ type: 'text', text: 'system prompt' }] },
      { id: '2', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      { id: '3', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
    ]
    const result = convertServerMessages(messages)
    expect(result).toHaveLength(2)
    expect(result.every((m) => m.role !== 'system')).toBe(true)
  })

  it('preserves id, role, and parts', () => {
    const parts = [{ type: 'text' as const, text: 'hello' }]
    const messages: ServerMessage[] = [{ id: 'msg-1', role: 'user', parts }]
    const result = convertServerMessages(messages)
    expect(result[0]).toEqual({ id: 'msg-1', role: 'user', parts })
  })

  it('defaults to empty parts array when parts is undefined', () => {
    const messages: ServerMessage[] = [
      { id: '1', role: 'user', parts: undefined as unknown as ServerMessage['parts'] },
    ]
    const result = convertServerMessages(messages)
    expect(result[0].parts).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(convertServerMessages([])).toEqual([])
  })

  it('returns empty array when all messages are system', () => {
    const messages: ServerMessage[] = [
      { id: '1', role: 'system', parts: [{ type: 'text', text: 'sys' }] },
    ]
    expect(convertServerMessages(messages)).toEqual([])
  })
})
