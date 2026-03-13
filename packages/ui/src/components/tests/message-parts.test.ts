import { describe, expect, it } from 'vitest'
import { groupParts } from '../message-parts'

function textPart(text: string): { type: 'text'; text: string } {
  return { type: 'text' as const, text }
}

function toolPart(toolName: string): {
  type: `tool-${string}`
  toolCallId: string
  toolName: string
  state: 'output-available'
  input: Record<string, never>
  output: string
} {
  return {
    type: `tool-${toolName}` as const,
    toolCallId: `call-${toolName}`,
    toolName,
    state: 'output-available' as const,
    input: {},
    output: '',
  }
}

describe('groupParts', () => {
  it('groups a single text part', () => {
    const groups = groupParts([textPart('hello')])
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('text')
  })

  it('groups a single tool part', () => {
    const groups = groupParts([toolPart('search')])
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('tools')
    if (groups[0].type === 'tools') {
      expect(groups[0].parts).toHaveLength(1)
    }
  })

  it('coalesces consecutive tool parts into one group', () => {
    const groups = groupParts([toolPart('search'), toolPart('fetch')])
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('tools')
    if (groups[0].type === 'tools') {
      expect(groups[0].parts).toHaveLength(2)
    }
  })

  it('separates text and tool groups', () => {
    const groups = groupParts([textPart('before'), toolPart('search'), textPart('after')])
    expect(groups).toHaveLength(3)
    expect(groups[0].type).toBe('text')
    expect(groups[1].type).toBe('tools')
    expect(groups[2].type).toBe('text')
  })

  it('creates new tool group after text interruption', () => {
    const groups = groupParts([toolPart('a'), textPart('middle'), toolPart('b'), toolPart('c')])
    expect(groups).toHaveLength(3)
    expect(groups[0].type).toBe('tools')
    expect(groups[1].type).toBe('text')
    expect(groups[2].type).toBe('tools')
    if (groups[0].type === 'tools') {
      expect(groups[0].parts).toHaveLength(1)
    }
    if (groups[2].type === 'tools') {
      expect(groups[2].parts).toHaveLength(2)
    }
  })

  it('returns empty array for empty input', () => {
    expect(groupParts([])).toEqual([])
  })

  it('skips non-text non-tool parts', () => {
    const parts = [
      textPart('hello'),
      { type: 'reasoning' as const, text: 'thinking...', providerMetadata: undefined },
    ]
    const groups = groupParts(parts as Parameters<typeof groupParts>[0])
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('text')
  })
})
