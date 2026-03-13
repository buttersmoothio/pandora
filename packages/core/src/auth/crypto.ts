/**
 * Cryptographic utilities for auth using Web Crypto API only (no npm deps).
 * Works on all target runtimes: Bun, Node.js, CF Workers, Deno, Vercel Edge.
 */

const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const TOKEN_BYTES = 32

function getSubtle(): SubtleCrypto {
  return globalThis.crypto.subtle
}

function toBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toHex(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function toBase64Url(buffer: ArrayBufferLike): string {
  return toBase64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Hash a password using PBKDF2-SHA256.
 * Returns { hash, salt, iterations } for storage.
 */
export async function hashPassword(
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const encoder = new TextEncoder()

  const keyMaterial = await getSubtle().importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const derived = await getSubtle().deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )

  return {
    hash: toBase64(derived),
    salt: toBase64(salt.buffer),
    iterations,
  }
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  const salt = fromBase64(stored.salt)
  const encoder = new TextEncoder()

  const keyMaterial = await getSubtle().importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const derived = await getSubtle().deriveBits(
    { name: 'PBKDF2', salt, iterations: stored.iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )

  const derivedBase64 = toBase64(derived)
  return timingSafeEqual(derivedBase64, stored.hash)
}

/**
 * Generate a session token (32 random bytes -> base64url).
 * Returns { token, tokenHash } where token is sent to client and tokenHash is stored.
 */
export async function generateSessionToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  const token = toBase64Url(bytes.buffer)

  const hashBuffer = await getSubtle().digest('SHA-256', bytes)
  const tokenHash = toHex(hashBuffer)

  return { token, tokenHash }
}

/**
 * Hash a raw token to get the stored hash for lookup.
 */
export async function hashToken(token: string): Promise<string> {
  // Decode base64url back to bytes
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = fromBase64(base64)

  const hashBuffer = await getSubtle().digest('SHA-256', bytes)
  return toHex(hashBuffer)
}

/**
 * Timing-safe string comparison using XOR accumulation.
 * Pure JS for cross-runtime compatibility.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
