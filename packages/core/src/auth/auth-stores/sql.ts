import type { AuthStore, PasswordCredential, Session } from '../auth-store'

const CREDENTIALS_TABLE = 'pandora_auth_credentials'
const SESSIONS_TABLE = 'pandora_auth_sessions'
const OWNER_KEY = 'owner'

/**
 * SQL-based auth store for LibSQL, PostgreSQL, MSSQL.
 * Zero driver-specific imports - callers provide a generic `execute` function.
 */
export class SQLAuthStore implements AuthStore {
  constructor(
    private execute: (sql: string, params?: unknown[]) => Promise<unknown[]>,
    private dialect: 'sqlite' | 'postgres' | 'mssql' = 'sqlite',
  ) {}

  // --- SQL generation helpers ---

  private param(index: number): string {
    switch (this.dialect) {
      case 'postgres':
        return `$${index}`
      case 'mssql':
        return `@p${index}`
      default:
        return '?'
    }
  }

  private get createCredentialsTableSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `
          CREATE TABLE IF NOT EXISTS ${CREDENTIALS_TABLE} (
            id TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            iterations INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `
      case 'mssql':
        return `
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${CREDENTIALS_TABLE}' AND xtype='U')
          CREATE TABLE ${CREDENTIALS_TABLE} (
            id NVARCHAR(255) PRIMARY KEY,
            hash NVARCHAR(MAX) NOT NULL,
            salt NVARCHAR(MAX) NOT NULL,
            iterations INT NOT NULL,
            created_at DATETIME2 DEFAULT GETUTCDATE()
          )
        `
      default:
        return `
          CREATE TABLE IF NOT EXISTS ${CREDENTIALS_TABLE} (
            id TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            iterations INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `
    }
  }

  private get createSessionsTableSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `
          CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
            token_hash TEXT PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            user_agent TEXT,
            ip TEXT
          )
        `
      case 'mssql':
        return `
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${SESSIONS_TABLE}' AND xtype='U')
          CREATE TABLE ${SESSIONS_TABLE} (
            token_hash NVARCHAR(255) PRIMARY KEY,
            expires_at DATETIME2 NOT NULL,
            created_at DATETIME2 DEFAULT GETUTCDATE(),
            user_agent NVARCHAR(MAX),
            ip NVARCHAR(255)
          )
        `
      default:
        return `
          CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
            token_hash TEXT PRIMARY KEY,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            user_agent TEXT,
            ip TEXT
          )
        `
    }
  }

  async init(): Promise<void> {
    await this.execute(this.createCredentialsTableSQL)
    await this.execute(this.createSessionsTableSQL)
  }

  async getCredential(): Promise<PasswordCredential | null> {
    try {
      const rows = await this.execute(
        `SELECT hash, salt, iterations, created_at FROM ${CREDENTIALS_TABLE} WHERE id = ${this.param(1)}`,
        [OWNER_KEY],
      )
      if (!rows || rows.length === 0) return null

      const row = rows[0] as { hash: string; salt: string; iterations: number; created_at: string }
      return {
        hash: row.hash,
        salt: row.salt,
        iterations: row.iterations,
        createdAt: row.created_at,
      }
    } catch {
      return null
    }
  }

  async setCredential(credential: PasswordCredential): Promise<void> {
    switch (this.dialect) {
      case 'postgres':
        await this.execute(
          `INSERT INTO ${CREDENTIALS_TABLE} (id, hash, salt, iterations, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET hash = $2, salt = $3, iterations = $4, created_at = $5`,
          [
            OWNER_KEY,
            credential.hash,
            credential.salt,
            credential.iterations,
            credential.createdAt,
          ],
        )
        break
      case 'mssql':
        await this.execute(
          `MERGE ${CREDENTIALS_TABLE} AS target
           USING (SELECT @p1 AS id, @p2 AS hash, @p3 AS salt, @p4 AS iterations, @p5 AS created_at) AS source
           ON target.id = source.id
           WHEN MATCHED THEN UPDATE SET hash = source.hash, salt = source.salt, iterations = source.iterations, created_at = source.created_at
           WHEN NOT MATCHED THEN INSERT (id, hash, salt, iterations, created_at) VALUES (source.id, source.hash, source.salt, source.iterations, source.created_at);`,
          [
            OWNER_KEY,
            credential.hash,
            credential.salt,
            credential.iterations,
            credential.createdAt,
          ],
        )
        break
      default:
        await this.execute(
          `INSERT INTO ${CREDENTIALS_TABLE} (id, hash, salt, iterations, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET hash = excluded.hash, salt = excluded.salt, iterations = excluded.iterations, created_at = excluded.created_at`,
          [
            OWNER_KEY,
            credential.hash,
            credential.salt,
            credential.iterations,
            credential.createdAt,
          ],
        )
    }
  }

  async createSession(session: Session): Promise<void> {
    await this.execute(
      `INSERT INTO ${SESSIONS_TABLE} (token_hash, expires_at, created_at, user_agent, ip)
       VALUES (${this.param(1)}, ${this.param(2)}, ${this.param(3)}, ${this.param(4)}, ${this.param(5)})`,
      [
        session.tokenHash,
        session.expiresAt,
        session.createdAt,
        session.userAgent ?? null,
        session.ip ?? null,
      ],
    )
  }

  async getSession(tokenHash: string): Promise<Session | null> {
    try {
      const rows = await this.execute(
        `SELECT token_hash, expires_at, created_at, user_agent, ip FROM ${SESSIONS_TABLE} WHERE token_hash = ${this.param(1)}`,
        [tokenHash],
      )
      if (!rows || rows.length === 0) return null

      const row = rows[0] as {
        token_hash: string
        expires_at: string
        created_at: string
        user_agent: string | null
        ip: string | null
      }

      // Check expiration
      if (new Date(row.expires_at) <= new Date()) {
        // Clean up expired session
        await this.deleteSession(tokenHash)
        return null
      }

      return {
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        userAgent: row.user_agent ?? undefined,
        ip: row.ip ?? undefined,
      }
    } catch {
      return null
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.execute(`DELETE FROM ${SESSIONS_TABLE} WHERE token_hash = ${this.param(1)}`, [
      tokenHash,
    ])
  }

  async deleteAllSessions(): Promise<void> {
    await this.execute(`DELETE FROM ${SESSIONS_TABLE}`)
  }

  async listSessions(): Promise<Session[]> {
    try {
      const nowStr = new Date().toISOString()
      const rows = await this.execute(
        `SELECT token_hash, expires_at, created_at, user_agent, ip FROM ${SESSIONS_TABLE} WHERE expires_at > ${this.param(1)}`,
        [nowStr],
      )
      return (
        rows as Array<{
          token_hash: string
          expires_at: string
          created_at: string
          user_agent: string | null
          ip: string | null
        }>
      ).map((row) => ({
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        userAgent: row.user_agent ?? undefined,
        ip: row.ip ?? undefined,
      }))
    } catch {
      return []
    }
  }
}
