const MAX_MESSAGE_LENGTH = 4096

/**
 * Split a message into chunks that fit within Telegram's message length limit.
 * Prefers splitting at paragraph boundaries (\n\n), then line breaks (\n),
 * and falls back to hard-splitting at the limit.
 */
export function splitMessage(text: string, maxLen = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    const slice = remaining.slice(0, maxLen)

    // Try to split at paragraph boundary
    let splitIndex = slice.lastIndexOf('\n\n')

    // Fall back to newline
    if (splitIndex === -1 || splitIndex < maxLen / 2) {
      splitIndex = slice.lastIndexOf('\n')
    }

    // Fall back to hard split
    if (splitIndex === -1 || splitIndex < maxLen / 2) {
      splitIndex = maxLen
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).replace(/^\n+/, '')
  }

  return chunks
}
