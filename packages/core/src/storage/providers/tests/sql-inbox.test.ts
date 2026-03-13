import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLInboxStore } from '../sql-inbox'

describe('SQLInboxStore', () => {
  describe.each(['sqlite', 'postgres', 'mssql'] as const)('%s dialect', (dialect) => {
    let store: SQLInboxStore
    let execute: ReturnType<typeof vi.fn>
    let calls: { sql: string; params?: unknown[] }[]

    beforeEach(() => {
      calls = []
      execute = vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return []
      })
      store = new SQLInboxStore(execute, dialect)
    })

    describe('init', () => {
      it('creates the table with dialect-specific types', async () => {
        await store.init()
        expect(execute).toHaveBeenCalledOnce()
        const sql = calls[0].sql

        expect(sql).toContain('pandora_inbox')

        if (dialect === 'postgres') {
          expect(sql).toContain('BOOLEAN')
          expect(sql).toContain('TIMESTAMPTZ')
          expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
        } else if (dialect === 'mssql') {
          expect(sql).toContain('BIT')
          expect(sql).toContain('DATETIME2')
          expect(sql).toContain('NVARCHAR')
          expect(sql).toContain('sysobjects')
        } else {
          expect(sql).toContain('INTEGER')
          expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
          expect(sql).toContain("datetime('now')")
        }
      })
    })

    describe('add', () => {
      it('inserts a row and returns an InboxMessage with id', async () => {
        const message = {
          subject: 'Hello',
          body: 'World',
          threadId: 'thread-1',
          destination: 'web',
          status: 'pending' as const,
        }

        const result = await store.add(message)

        expect(execute).toHaveBeenCalledOnce()
        const { sql, params } = calls[0]

        expect(sql).toContain('INSERT INTO pandora_inbox')
        expect(params?.[1]).toBe('Hello')
        expect(params?.[2]).toBe('World')
        expect(params?.[3]).toBe('thread-1')
        expect(params?.[4]).toBe('web')
        expect(params?.[5]).toBe('pending')

        expect(result.id).toBeTypeOf('string')
        expect(result.subject).toBe('Hello')
        expect(result.body).toBe('World')
        expect(result.threadId).toBe('thread-1')
        expect(result.destination).toBe('web')
        expect(result.status).toBe('pending')
        expect(result.read).toBe(false)
        expect(result.archivedAt).toBeNull()
        expect(result.createdAt).toBeTypeOf('string')
      })

      it('uses correct parameter placeholders', async () => {
        await store.add({
          subject: 's',
          body: 'b',
          threadId: null,
          destination: 'web',
          status: 'sent' as const,
        })
        const sql = calls[0].sql

        if (dialect === 'postgres') {
          expect(sql).toContain('$1')
          expect(sql).toContain('$7')
        } else if (dialect === 'mssql') {
          expect(sql).toContain('@p1')
          expect(sql).toContain('@p7')
        } else {
          expect(sql).toContain('?')
          expect(sql).not.toContain('$1')
          expect(sql).not.toContain('@p1')
        }
      })
    })

    describe('list', () => {
      it('queries non-archived messages by default', async () => {
        await store.list()
        const sql = calls[0].sql

        expect(sql).toContain('archived_at IS NULL')
        expect(sql).toContain('ORDER BY created_at DESC')
      })

      it('queries archived messages when archived: true', async () => {
        await store.list({ archived: true })
        const sql = calls[0].sql

        expect(sql).toContain('archived_at IS NOT NULL')
      })

      it('returns mapped InboxMessage objects', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'Test',
            body: 'Body',
            thread_id: 'thread-1',
            destination: 'web',
            status: 'sent',
            read: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            archived_at: null,
          },
          {
            id: 'msg-2',
            subject: 'Test 2',
            body: 'Body 2',
            thread_id: null,
            destination: 'telegram',
            status: 'pending',
            read: 1,
            created_at: '2024-01-02T00:00:00.000Z',
            archived_at: '2024-01-03T00:00:00.000Z',
          },
        ])

        const result = await store.list()

        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({
          id: 'msg-1',
          subject: 'Test',
          body: 'Body',
          threadId: 'thread-1',
          destination: 'web',
          status: 'sent',
          read: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          archivedAt: null,
        })
        expect(result[1]).toEqual({
          id: 'msg-2',
          subject: 'Test 2',
          body: 'Body 2',
          threadId: null,
          destination: 'telegram',
          status: 'pending',
          read: true,
          createdAt: '2024-01-02T00:00:00.000Z',
          archivedAt: '2024-01-03T00:00:00.000Z',
        })
      })

      it('returns empty array when no rows', async () => {
        const result = await store.list()
        expect(result).toEqual([])
      })
    })

    describe('get', () => {
      it('returns message when found', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'Test',
            body: 'Body',
            thread_id: 'thread-1',
            destination: 'web',
            status: 'sent',
            read: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            archived_at: null,
          },
        ])

        const result = await store.get('msg-1')

        expect(result).toEqual({
          id: 'msg-1',
          subject: 'Test',
          body: 'Body',
          threadId: 'thread-1',
          destination: 'web',
          status: 'sent',
          read: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          archivedAt: null,
        })
        expect(execute.mock.calls[0][1]).toEqual(['msg-1'])
      })

      it('returns null when no rows', async () => {
        const result = await store.get('nonexistent')
        expect(result).toBeNull()
      })

      it('uses correct parameter placeholder', async () => {
        await store.get('msg-1')
        const sql = calls[0].sql

        if (dialect === 'postgres') {
          expect(sql).toContain('$1')
        } else if (dialect === 'mssql') {
          expect(sql).toContain('@p1')
        } else {
          expect(sql).toContain('?')
        }
      })
    })

    describe('markRead', () => {
      it('updates read column with dialect-appropriate value', async () => {
        await store.markRead('msg-1')

        expect(execute).toHaveBeenCalledOnce()
        const { sql, params } = calls[0]

        expect(sql).toContain('UPDATE pandora_inbox SET read')

        if (dialect === 'postgres') {
          expect(params?.[0]).toBe(true)
        } else {
          expect(params?.[0]).toBe(1)
        }
        expect(params?.[1]).toBe('msg-1')
      })
    })

    describe('updateStatus', () => {
      it('updates status column', async () => {
        await store.updateStatus('msg-1', 'failed')

        expect(execute).toHaveBeenCalledOnce()
        const { sql, params } = calls[0]

        expect(sql).toContain('UPDATE pandora_inbox SET status')
        expect(params?.[0]).toBe('failed')
        expect(params?.[1]).toBe('msg-1')
      })
    })

    describe('archive', () => {
      it('sets archived_at to ISO timestamp', async () => {
        const before = new Date().toISOString()
        await store.archive('msg-1')
        const after = new Date().toISOString()

        expect(execute).toHaveBeenCalledOnce()
        const { sql, params } = calls[0]

        expect(sql).toContain('UPDATE pandora_inbox SET archived_at')
        expect(params?.[1]).toBe('msg-1')

        const timestamp = params?.[0] as string
        expect(timestamp >= before).toBe(true)
        expect(timestamp <= after).toBe(true)
      })
    })

    describe('unarchive', () => {
      it('sets archived_at to NULL', async () => {
        await store.unarchive('msg-1')

        expect(execute).toHaveBeenCalledOnce()
        const { sql, params } = calls[0]

        expect(sql).toContain('UPDATE pandora_inbox SET archived_at = NULL')
        expect(params).toEqual(['msg-1'])
      })
    })

    describe('delete', () => {
      it('deletes by id', async () => {
        await store.delete('msg-1')

        expect(execute).toHaveBeenCalledOnce()
        const { sql, params } = calls[0]

        expect(sql).toContain('DELETE')
        expect(sql).toContain('pandora_inbox')
        expect(params).toEqual(['msg-1'])
      })
    })

    describe('toMessage mapping', () => {
      it('converts read number to boolean', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'S',
            body: 'B',
            thread_id: null,
            destination: 'web',
            status: 'sent',
            read: 1,
            created_at: '2024-01-01T00:00:00.000Z',
            archived_at: null,
          },
        ])
        const result = await store.get('msg-1')
        expect(result?.read).toBe(true)
      })

      it('converts read false/0 to boolean false', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'S',
            body: 'B',
            thread_id: null,
            destination: 'web',
            status: 'sent',
            read: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            archived_at: null,
          },
        ])
        const result = await store.get('msg-1')
        expect(result?.read).toBe(false)
      })

      it('falls back to "sent" for invalid status values', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'S',
            body: 'B',
            thread_id: null,
            destination: 'web',
            status: 'invalid_status',
            read: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            archived_at: null,
          },
        ])
        const result = await store.get('msg-1')
        expect(result?.status).toBe('sent')
      })

      it('preserves valid status values', async () => {
        for (const status of ['pending', 'sent', 'failed']) {
          execute.mockResolvedValueOnce([
            {
              id: `msg-${status}`,
              subject: 'S',
              body: 'B',
              thread_id: null,
              destination: 'web',
              status,
              read: 0,
              created_at: '2024-01-01T00:00:00.000Z',
              archived_at: null,
            },
          ])
          const result = await store.get(`msg-${status}`)
          expect(result?.status).toBe(status)
        }
      })

      it('maps snake_case row fields to camelCase', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'Subject',
            body: 'Body',
            thread_id: 'thread-99',
            destination: 'telegram',
            status: 'pending',
            read: 1,
            created_at: '2024-06-15T12:00:00.000Z',
            archived_at: '2024-06-16T12:00:00.000Z',
          },
        ])

        const result = await store.get('msg-1')

        expect(result).toEqual({
          id: 'msg-1',
          subject: 'Subject',
          body: 'Body',
          threadId: 'thread-99',
          destination: 'telegram',
          status: 'pending',
          read: true,
          createdAt: '2024-06-15T12:00:00.000Z',
          archivedAt: '2024-06-16T12:00:00.000Z',
        })
      })

      it('defaults destination to "web" when missing', async () => {
        execute.mockResolvedValueOnce([
          {
            id: 'msg-1',
            subject: 'S',
            body: 'B',
            thread_id: null,
            destination: undefined,
            status: 'sent',
            read: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            archived_at: null,
          },
        ])
        const result = await store.get('msg-1')
        expect(result?.destination).toBe('web')
      })
    })
  })

  it('defaults to sqlite dialect', () => {
    const execute = vi.fn(async (_sql: string, _params?: unknown[]) => [])
    const store = new SQLInboxStore(execute)

    store.get('test')
    const sql = execute.mock.calls[0][0]
    expect(sql).toContain('?')
    expect(sql).not.toContain('$1')
    expect(sql).not.toContain('@p1')
  })
})
