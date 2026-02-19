/**
 * Types and abstract interface for auth persistence across all storage backends.
 * Each backend implements this using its native client/driver.
 */

export interface PasswordCredential {
  /** PBKDF2-SHA256 hash (base64) */
  hash: string
  /** Random salt (base64) */
  salt: string
  /** PBKDF2 iteration count */
  iterations: number
  /** ISO timestamp of creation */
  createdAt: string
}

export interface Session {
  /** SHA-256 hash of the session token (hex) */
  tokenHash: string
  /** ISO timestamp of expiration */
  expiresAt: string
  /** ISO timestamp of creation */
  createdAt: string
  /** User-agent string (for session listing) */
  userAgent?: string
  /** IP address (for session listing) */
  ip?: string
}

export interface AuthStore {
  /** Initialize tables/collections if needed */
  init(): Promise<void>

  /** Get the owner's password credential, or null if not set up */
  getCredential(): Promise<PasswordCredential | null>

  /** Save the owner's password credential (single-owner, replaces any existing) */
  setCredential(credential: PasswordCredential): Promise<void>

  /** Create a new session */
  createSession(session: Session): Promise<void>

  /** Get a session by token hash, or null if not found/expired */
  getSession(tokenHash: string): Promise<Session | null>

  /** Delete a session by token hash */
  deleteSession(tokenHash: string): Promise<void>

  /** Delete all sessions (used on password change) */
  deleteAllSessions(): Promise<void>

  /** List all active (non-expired) sessions */
  listSessions(): Promise<Session[]>

  /** Close any connections (optional cleanup) */
  close?(): Promise<void>
}
