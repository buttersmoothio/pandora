/** A date-grouped section of observation memory text. */
export interface ObservationSection {
  /** Date header (e.g. `"2026-03-13"`), or `null` for content without a date prefix. */
  title: string | null
  /** Observation text with the date header stripped. */
  content: string
}

/** Extract the data portion from the raw working memory string. */
export function parseWorkingMemoryData(raw: string): string {
  const match = raw.match(/<working_memory_data>([\s\S]*?)<\/working_memory_data>/)
  return match ? match[1].trim() : raw.trim()
}

/** Reconstruct the full working memory string, replacing only the data portion. */
export function replaceWorkingMemoryData(raw: string, newData: string): string {
  const hasWrapper = /<working_memory_data>[\s\S]*?<\/working_memory_data>/.test(raw)
  if (hasWrapper) {
    return raw.replace(
      /<working_memory_data>[\s\S]*?<\/working_memory_data>/,
      `<working_memory_data>\n${newData}\n</working_memory_data>`,
    )
  }
  return newData
}

/** Clean raw OM text and split into date-based sections for card rendering. */
export function parseObservationSections(
  raw: string,
  toolNames: Map<string, string>,
): ObservationSection[] {
  const cleaned = raw
    .replace(/<thread[^>]*>|<\/thread>/gu, '')
    .replace(/`([^`]+)`/g, (_match, id: string) => {
      const name = toolNames.get(id)
      return name ? `*${name}*` : `*${id}*`
    })
    .trim()

  const parts = cleaned.split(/(?=^Date:\s)/m)
  const sections: ObservationSection[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) {
      continue
    }
    const dateMatch = trimmed.match(/^Date:\s*(.+)/m)
    if (dateMatch) {
      sections.push({
        title: dateMatch[1].trim(),
        content: trimmed.replace(/^Date:\s*.+\n?/, '').trim(),
      })
    } else {
      sections.push({ title: null, content: trimmed })
    }
  }

  return sections
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`
  }
  return String(tokens)
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) {
    return 'just now'
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days}d ago`
  }
  return new Date(dateStr).toLocaleDateString()
}
