import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLConfigStore } from './sql'

const testConfig = {
  identity: { name: 'Test', description: 'Test bot', version: '1.0.0' },
  models: { default: { provider: 'anthropic', model: 'test' } },
}

describe('SQLConfigStore', () => {
  describe.each(['sqlite', 'postgres', 'mssql'] as const)('%s dialect', (dialect) => {
    let store: SQLConfigStore
    let execute: ReturnType<typeof vi.fn>
    let calls: { sql: string; params?: unknown[] }[]

    beforeEach(() => {
      calls = []
      execute = vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return []
      })
      store = new SQLConfigStore(execute, dialect)
    })

    describe('init', () => {
      it('creates the table', async () => {
        await store.init()
        expect(execute).toHaveBeenCalledOnce()
        const sql = calls[0].sql

        expect(sql).toContain('pandora_config')

        if (dialect === 'postgres') {
          expect(sql).toContain('JSONB')
          expect(sql).toContain('TIMESTAMPTZ')
        } else if (dialect === 'mssql') {
          expect(sql).toContain('NVARCHAR')
          expect(sql).toContain('DATETIME2')
          expect(sql).toContain('sysobjects')
        } else {
          expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
          expect(sql).toContain("datetime('now')")
        }
      })
    })

    describe('get', () => {
      it('returns null when no rows', async () => {
        const result = await store.get()
        expect(result).toBeNull()
      })

      it('returns null on execute error (table not exists)', async () => {
        execute.mockRejectedValueOnce(new Error('no such table'))
        const result = await store.get()
        expect(result).toBeNull()
      })

      it('parses JSON string value', async () => {
        execute.mockResolvedValueOnce([{ value: JSON.stringify(testConfig) }])
        const result = await store.get()
        expect(result).toEqual(testConfig)
      })

      it('returns object value directly (postgres JSONB)', async () => {
        execute.mockResolvedValueOnce([{ value: testConfig }])
        const result = await store.get()
        expect(result).toEqual(testConfig)
      })

      it('uses correct parameter placeholder', async () => {
        await store.get()
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

    describe('set', () => {
      it('upserts config with correct params', async () => {
        await store.set(testConfig)
        expect(execute).toHaveBeenCalledOnce()

        const { sql, params } = calls[0]
        expect(sql).toContain('pandora_config')
        expect(params?.[0]).toBe('main')

        if (dialect === 'postgres') {
          expect(params?.[1]).toEqual(testConfig)
          expect(sql).toContain('ON CONFLICT')
        } else if (dialect === 'mssql') {
          expect(params?.[1]).toBe(JSON.stringify(testConfig))
          expect(sql).toContain('MERGE')
        } else {
          expect(params?.[1]).toBe(JSON.stringify(testConfig))
          expect(sql).toContain('ON CONFLICT')
        }
      })
    })

    describe('delete', () => {
      it('deletes by key', async () => {
        await store.delete()
        expect(execute).toHaveBeenCalledOnce()

        const { sql, params } = calls[0]
        expect(sql).toContain('DELETE')
        expect(sql).toContain('pandora_config')
        expect(params).toEqual(['main'])
      })

      it('swallows errors (table not exists)', async () => {
        execute.mockRejectedValueOnce(new Error('no such table'))
        await expect(store.delete()).resolves.toBeUndefined()
      })
    })
  })

  it('defaults to sqlite dialect', () => {
    const execute = vi.fn(async (_sql: string, _params?: unknown[]) => [])
    const store = new SQLConfigStore(execute)

    store.get()
    const sql = execute.mock.calls[0][0]
    expect(sql).toContain('?')
    expect(sql).not.toContain('$1')
    expect(sql).not.toContain('@p1')
  })
})
