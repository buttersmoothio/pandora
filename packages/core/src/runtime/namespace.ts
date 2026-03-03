/**
 * Validate that an entity ID (tool, agent, channel) does not contain
 * a colon, which would create ambiguous namespaced keys.
 * Throws if the ID is invalid.
 */
export function validateEntityId(kind: string, pluginId: string, entityId: string): void {
  if (!entityId || entityId.includes(':')) {
    throw new Error(
      `Invalid ${kind} ID "${entityId}" in plugin "${pluginId}": must be non-empty and cannot contain colons`,
    )
  }
}

/** Build a namespaced key: `pluginId:entityId` */
export function namespacedKey(pluginId: string, entityId: string): string {
  return `${pluginId}:${entityId}`
}

/** Encode a namespaced key to a URL-safe base64url string. */
export function encodeNsKey(nsKey: string): string {
  return btoa(nsKey.toLowerCase()).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decode a base64url string back to a namespaced key. */
export function decodeNsKey(encoded: string): string {
  const padded =
    encoded.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (encoded.length % 4)) % 4)
  return atob(padded)
}
