import { describe, expect, it } from 'vitest'
import { markdownToHtml } from '../format'

describe('markdownToHtml', () => {
  it('converts bold text', () => {
    expect(markdownToHtml('**bold**')).toBe('<strong>bold</strong>')
  })

  it('converts italic text', () => {
    expect(markdownToHtml('*italic*')).toBe('<em>italic</em>')
  })

  it('converts inline code', () => {
    expect(markdownToHtml('`code`')).toBe('<code>code</code>')
  })

  it('converts code blocks', () => {
    const md = '```\nconst x = 1\n```'
    const html = markdownToHtml(md)
    expect(html).toContain('<pre>')
    expect(html).toContain('<code>')
    expect(html).toContain('const x = 1')
  })

  it('converts headings to bold', () => {
    expect(markdownToHtml('# Title')).toBe('<b>Title</b>')
  })

  it('converts unordered lists', () => {
    const md = '- one\n- two\n- three'
    const html = markdownToHtml(md)
    expect(html).toContain('• one')
    expect(html).toContain('• two')
    expect(html).toContain('• three')
  })

  it('converts ordered lists', () => {
    const md = '1. one\n2. two\n3. three'
    const html = markdownToHtml(md)
    expect(html).toContain('1. one')
    expect(html).toContain('2. two')
    expect(html).toContain('3. three')
  })

  it('converts links', () => {
    expect(markdownToHtml('[click](https://example.com)')).toBe(
      '<a href="https://example.com">click</a>',
    )
  })

  it('converts blockquotes', () => {
    const html = markdownToHtml('> quoted text')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('quoted text')
  })

  it('strips unsupported HTML tags', () => {
    const md = 'plain text'
    const html = markdownToHtml(md)
    expect(html).not.toContain('<div>')
    expect(html).not.toContain('<span>')
  })

  it('collapses multiple newlines', () => {
    const md = 'para1\n\n\n\n\npara2'
    const html = markdownToHtml(md)
    expect(html).not.toContain('\n\n\n')
  })

  it('trims whitespace', () => {
    const html = markdownToHtml('  hello  ')
    expect(html).toBe('hello')
  })
})
