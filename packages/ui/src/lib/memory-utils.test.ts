import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatTokens,
  parseObservationSections,
  parseWorkingMemoryData,
  replaceWorkingMemoryData,
  timeAgo,
} from './memory-utils'

describe('parseWorkingMemoryData', () => {
  it('extracts content between tags', () => {
    const raw = 'prefix <working_memory_data>\nhello world\n</working_memory_data> suffix'
    expect(parseWorkingMemoryData(raw)).toBe('hello world')
  })

  it('trims whitespace from extracted content', () => {
    const raw = '<working_memory_data>  \n  spaced  \n  </working_memory_data>'
    expect(parseWorkingMemoryData(raw)).toBe('spaced')
  })

  it('returns trimmed raw when no tags exist', () => {
    expect(parseWorkingMemoryData('  plain text  ')).toBe('plain text')
  })

  it('handles multiline content', () => {
    const raw = '<working_memory_data>\nline1\nline2\nline3\n</working_memory_data>'
    expect(parseWorkingMemoryData(raw)).toBe('line1\nline2\nline3')
  })
})

describe('replaceWorkingMemoryData', () => {
  it('replaces content within tags, preserving surrounding text', () => {
    const raw = 'before <working_memory_data>\nold\n</working_memory_data> after'
    const result = replaceWorkingMemoryData(raw, 'new')
    expect(result).toContain('<working_memory_data>\nnew\n</working_memory_data>')
    expect(result).toContain('before')
    expect(result).toContain('after')
  })

  it('returns just newData when no tags exist', () => {
    expect(replaceWorkingMemoryData('no tags here', 'replacement')).toBe('replacement')
  })
})

describe('formatTokens', () => {
  it('returns string for values under 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(10000)).toBe('10.0k')
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent times', () => {
    expect(timeAgo('2024-06-15T11:59:30.000Z')).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(timeAgo('2024-06-15T11:55:00.000Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(timeAgo('2024-06-15T09:00:00.000Z')).toBe('3h ago')
  })

  it('returns days ago', () => {
    expect(timeAgo('2024-06-13T12:00:00.000Z')).toBe('2d ago')
  })
})

describe('parseObservationSections', () => {
  it('strips thread wrapper tags', () => {
    const raw = '<thread id="abc">Some content</thread>'
    const sections = parseObservationSections(raw, new Map())
    expect(sections).toHaveLength(1)
    expect(sections[0].content).toBe('Some content')
    expect(sections[0].content).not.toContain('<thread')
  })

  it('substitutes tool names from map', () => {
    const raw = 'Used `tool-123` for the task'
    const toolNames = new Map([['tool-123', 'Web Search']])
    const sections = parseObservationSections(raw, toolNames)
    expect(sections[0].content).toContain('*Web Search*')
    expect(sections[0].content).not.toContain('`tool-123`')
  })

  it('falls back to raw id when tool name not in map', () => {
    const raw = 'Used `unknown-tool` for the task'
    const sections = parseObservationSections(raw, new Map())
    expect(sections[0].content).toContain('*unknown-tool*')
  })

  it('splits on Date: headers', () => {
    const raw = 'Date: 2024-06-15\nFirst section\nDate: 2024-06-16\nSecond section'
    const sections = parseObservationSections(raw, new Map())
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('2024-06-15')
    expect(sections[0].content).toBe('First section')
    expect(sections[1].title).toBe('2024-06-16')
    expect(sections[1].content).toBe('Second section')
  })

  it('returns null title for sections without Date prefix', () => {
    const raw = 'Just some observations without dates'
    const sections = parseObservationSections(raw, new Map())
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBeNull()
    expect(sections[0].content).toBe('Just some observations without dates')
  })

  it('handles empty input', () => {
    expect(parseObservationSections('', new Map())).toHaveLength(0)
    expect(parseObservationSections('  ', new Map())).toHaveLength(0)
  })
})
