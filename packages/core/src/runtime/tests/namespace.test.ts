import { describe, expect, it } from 'vitest'
import { decodeNsKey, encodeNsKey, namespacedKey, validateEntityId } from '../namespace'

describe('validateEntityId', () => {
  it('passes for valid IDs', () => {
    expect(() => validateEntityId('tool', 'plugin-a', 'my-tool')).not.toThrow()
    expect(() => validateEntityId('agent', '@pandorakit/foo', 'bar')).not.toThrow()
  })

  it('throws for empty ID', () => {
    expect(() => validateEntityId('tool', 'plugin-a', '')).toThrow(
      'Invalid tool ID "" in plugin "plugin-a"',
    )
  })

  it('throws for ID containing colon', () => {
    expect(() => validateEntityId('tool', 'plugin-a', 'bad:id')).toThrow(
      'Invalid tool ID "bad:id" in plugin "plugin-a"',
    )
  })

  it('includes kind and plugin in error message', () => {
    expect(() => validateEntityId('channel', 'my-plugin', 'x:y')).toThrow(
      'Invalid channel ID "x:y" in plugin "my-plugin"',
    )
  })
})

describe('namespacedKey', () => {
  it('joins plugin and entity with colon', () => {
    expect(namespacedKey('plugin-a', 'tool-a')).toBe('plugin-a:tool-a')
  })

  it('handles scoped package names', () => {
    expect(namespacedKey('@pandorakit/tavily-search', 'tavily_search')).toBe(
      '@pandorakit/tavily-search:tavily_search',
    )
  })
})

describe('encodeNsKey / decodeNsKey', () => {
  it('round-trips a simple namespaced key', () => {
    const key = 'plugin-a:tool-a'
    expect(decodeNsKey(encodeNsKey(key))).toBe(key.toLowerCase())
  })

  it('round-trips a scoped package key', () => {
    const key = '@pandorakit/tavily-search:tavily_search'
    expect(decodeNsKey(encodeNsKey(key))).toBe(key.toLowerCase())
  })

  it('produces URL-safe output (no +, /, =)', () => {
    const encoded = encodeNsKey('@pandorakit/tavily-search:tavily_search')
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('lowercases the key before encoding', () => {
    const upper = encodeNsKey('Plugin-A:Tool-B')
    const lower = encodeNsKey('plugin-a:tool-b')
    expect(upper).toBe(lower)
  })
})
