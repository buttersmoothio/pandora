import { describe, expect, it } from 'vitest'
import { splitMessage } from './telegram-api'

describe('splitMessage', () => {
  it('returns single-element array for short text', () => {
    expect(splitMessage('hello')).toEqual(['hello'])
  })

  it('returns single-element array for text exactly at limit', () => {
    const text = 'a'.repeat(4096)
    expect(splitMessage(text)).toEqual([text])
  })

  it('splits at paragraph boundary when available', () => {
    const para1 = 'a'.repeat(3000)
    const para2 = 'b'.repeat(3000)
    const text = `${para1}\n\n${para2}`
    const chunks = splitMessage(text)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(para1)
    expect(chunks[1]).toBe(para2)
  })

  it('splits at newline when no paragraph boundary', () => {
    const line1 = 'a'.repeat(3000)
    const line2 = 'b'.repeat(3000)
    const text = `${line1}\n${line2}`
    const chunks = splitMessage(text)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(line1)
    expect(chunks[1]).toBe(line2)
  })

  it('hard-splits when no newlines available', () => {
    const text = 'a'.repeat(5000)
    const chunks = splitMessage(text)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe('a'.repeat(4096))
    expect(chunks[1]).toBe('a'.repeat(904))
  })

  it('produces multiple chunks for very long text', () => {
    const text = 'a'.repeat(10000)
    const chunks = splitMessage(text)

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096)
    }
    expect(chunks.join('')).toBe(text)
  })

  it('trims leading newlines from remainder after split', () => {
    const line1 = 'a'.repeat(4090)
    const text = `${line1}\n\n\n\nshort`
    const chunks = splitMessage(text)

    expect(chunks).toHaveLength(2)
    // Leading newlines on the remainder are stripped
    expect(chunks[1]).toBe('short')
  })
})
