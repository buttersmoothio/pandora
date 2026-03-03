/**
 * Markdown → Telegram HTML converter
 *
 * Uses the unified/remark/rehype pipeline to parse markdown into an AST,
 * then transforms unsupported HTML elements into Telegram-compatible equivalents.
 *
 * Telegram HTML subset: <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>,
 * <del>, <a href>, <code>, <pre>, <blockquote>.
 */

import type { Element, ElementContent, Properties, Root, Text } from 'hast'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

/** Tags that Telegram's HTML mode supports natively. */
const TELEGRAM_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'strike',
  'del',
  'a',
  'code',
  'pre',
  'blockquote',
])

/** Attributes to preserve per tag (everything else is stripped). */
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href']),
  code: new Set(['className']),
}

// ── AST helpers ──────────────────────────────────────────────

function text(value: string): Text {
  return { type: 'text', value }
}

function element(
  tagName: string,
  children: ElementContent[],
  properties: Properties = {},
): Element {
  return { type: 'element', tagName, properties, children }
}

/** Keep only the attributes Telegram allows for a given tag. */
function filterProperties(tagName: string, properties: Properties | undefined): Properties {
  const allowed = ALLOWED_ATTRIBUTES[tagName]
  if (!(allowed && properties)) return {}

  const filtered: Properties = {}
  for (const [key, value] of Object.entries(properties)) {
    if (allowed.has(key)) {
      filtered[key] = value
    }
  }
  return filtered
}

// ── Tree transformation ──────────────────────────────────────

interface ListContext {
  listType?: 'ul' | 'ol'
  counter?: number
}

/**
 * Recursively transform hast nodes to only use Telegram-compatible elements.
 * Unsupported elements are converted to text equivalents or unwrapped.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inherently complex tag dispatch
function transformNodes(nodes: ElementContent[], ctx: ListContext = {}): ElementContent[] {
  const result: ElementContent[] = []

  for (const node of nodes) {
    if (node.type === 'text') {
      result.push(node)
      continue
    }

    if (node.type !== 'element') continue

    const tag = node.tagName

    // ── Headings → <b>…</b> + newline ──
    if (/^h[1-6]$/.test(tag)) {
      result.push(element('b', transformNodes(node.children)), text('\n\n'))
      continue
    }

    // ── Paragraphs → unwrap + double newline ──
    if (tag === 'p') {
      result.push(...transformNodes(node.children), text('\n\n'))
      continue
    }

    // ── Lists → process items with bullet / number context ──
    if (tag === 'ul') {
      result.push(...transformNodes(node.children, { listType: 'ul' }))
      continue
    }

    if (tag === 'ol') {
      const start = Number(node.properties?.start) || 1
      result.push(...transformNodes(node.children, { listType: 'ol', counter: start }))
      continue
    }

    if (tag === 'li') {
      const prefix = ctx.listType === 'ol' ? `${ctx.counter ?? 1}. ` : '• '
      if (ctx.listType === 'ol' && ctx.counter !== undefined) {
        ctx.counter++
      }

      const inner = transformNodes(node.children)

      // Trim trailing \n\n left by an inner <p> down to \n
      const last = inner[inner.length - 1]
      if (last?.type === 'text' && last.value.endsWith('\n\n')) {
        last.value = last.value.slice(0, -1)
      } else if (!last || last.type !== 'text' || !last.value.endsWith('\n')) {
        inner.push(text('\n'))
      }

      result.push(text(prefix), ...inner)
      continue
    }

    // ── Misc block elements ──
    if (tag === 'br') {
      result.push(text('\n'))
      continue
    }

    if (tag === 'hr') {
      result.push(text('\n'))
      continue
    }

    if (tag === 'img') {
      const alt = String(node.properties?.alt ?? '')
      if (alt) result.push(text(alt))
      continue
    }

    // ── Telegram-supported tags → keep with filtered attributes ──
    if (TELEGRAM_TAGS.has(tag)) {
      result.push(
        element(tag, transformNodes(node.children), filterProperties(tag, node.properties)),
      )
      continue
    }

    // ── Unknown tags → unwrap (keep children only) ──
    result.push(...transformNodes(node.children))
  }

  return result
}

// ── Rehype plugin ────────────────────────────────────────────

/**
 * Rehype plugin that transforms the HTML AST to only use
 * Telegram-compatible elements.
 */
function rehypeTelegram() {
  return (tree: Root) => {
    const elements = tree.children.filter(
      (c): c is ElementContent => c.type === 'element' || c.type === 'text',
    )
    tree.children = transformNodes(elements)
  }
}

// ── Public API ───────────────────────────────────────────────

/** Reusable unified processor (frozen on first use). */
const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeTelegram)
  .use(rehypeStringify)

/**
 * Convert markdown text to Telegram-compatible HTML.
 *
 * @param markdown - Raw markdown string (as output by the model).
 * @returns HTML string safe for Telegram's `parse_mode: "HTML"`.
 */
export function markdownToHtml(markdown: string): string {
  const result = processor.processSync(markdown)
  // Collapse runs of 3+ newlines and trim edges
  return String(result)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
