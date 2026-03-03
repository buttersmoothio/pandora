import type { InboxMessage, InboxStore } from '../inbox-store'

const TABLE = 'pandora_inbox'

export class SQLInboxStore implements InboxStore {
  constructor(
    private execute: (sql: string, params?: unknown[]) => Promise<unknown[]>,
    private dialect: 'sqlite' | 'postgres' | 'mssql' = 'sqlite',
  ) {}

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

  private get createTableSQL(): string {
    switch (this.dialect) {
      case 'postgres':
        return `
          CREATE TABLE IF NOT EXISTS ${TABLE} (
            id TEXT PRIMARY KEY,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            thread_id TEXT,
            read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `
      case 'mssql':
        return `
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${TABLE}' AND xtype='U')
          CREATE TABLE ${TABLE} (
            id NVARCHAR(255) PRIMARY KEY,
            subject NVARCHAR(MAX) NOT NULL,
            body NVARCHAR(MAX) NOT NULL,
            thread_id NVARCHAR(255),
            read BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETUTCDATE()
          )
        `
      default:
        return `
          CREATE TABLE IF NOT EXISTS ${TABLE} (
            id TEXT PRIMARY KEY,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            thread_id TEXT,
            read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `
    }
  }

  async init(): Promise<void> {
    await this.execute(this.createTableSQL)
  }

  async add(message: Omit<InboxMessage, 'id' | 'read' | 'createdAt'>): Promise<InboxMessage> {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    await this.execute(
      `INSERT INTO ${TABLE} (id, subject, body, thread_id, created_at)
       VALUES (${this.param(1)}, ${this.param(2)}, ${this.param(3)}, ${this.param(4)}, ${this.param(5)})`,
      [id, message.subject, message.body, message.threadId, createdAt],
    )
    return {
      id,
      subject: message.subject,
      body: message.body,
      threadId: message.threadId,
      read: false,
      createdAt,
    }
  }

  async list(): Promise<InboxMessage[]> {
    const rows = await this.execute(
      `SELECT id, subject, body, thread_id, read, created_at FROM ${TABLE} ORDER BY created_at DESC`,
    )
    return (rows as Record<string, unknown>[]).map(toMessage)
  }

  async get(id: string): Promise<InboxMessage | null> {
    const rows = await this.execute(
      `SELECT id, subject, body, thread_id, read, created_at FROM ${TABLE} WHERE id = ${this.param(1)}`,
      [id],
    )
    if (!rows || rows.length === 0) return null
    return toMessage(rows[0] as Record<string, unknown>)
  }

  async markRead(id: string): Promise<void> {
    const val = this.dialect === 'postgres' ? true : 1
    await this.execute(`UPDATE ${TABLE} SET read = ${this.param(1)} WHERE id = ${this.param(2)}`, [
      val,
      id,
    ])
  }

  async delete(id: string): Promise<void> {
    await this.execute(`DELETE FROM ${TABLE} WHERE id = ${this.param(1)}`, [id])
  }
}

function toMessage(row: Record<string, unknown>): InboxMessage {
  return {
    id: row.id as string,
    subject: row.subject as string,
    body: row.body as string,
    threadId: (row.thread_id as string) ?? null,
    read: !!row.read,
    createdAt: row.created_at as string,
  }
}
