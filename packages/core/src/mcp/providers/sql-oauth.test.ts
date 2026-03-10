import { describe, expect, it, vi } from 'vitest'
import { SQLMcpOAuthStore } from './sql-oauth'

describe('SQLMcpOAuthStore', () => {
  describe.each(['sqlite', 'postgres', 'mssql'] as const)('%s dialect', (dialect) => {
    let store: SQLMcpOAuthStore
    let mockExecute: ReturnType<typeof vi.fn>

    function createStore() {
      mockExecute = vi.fn().mockResolvedValue([])
      store = new SQLMcpOAuthStore(mockExecute, dialect)
    }

    it('init creates the table', async () => {
      createStore()
      await store.init()

      expect(mockExecute).toHaveBeenCalledOnce()
      const sql = mockExecute.mock.calls[0][0] as string
      expect(sql).toContain('pandora_mcp_oauth')
      if (dialect === 'mssql') {
        expect(sql).toContain('sysobjects')
      } else {
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
      }
    })

    it('get returns value when key exists', async () => {
      createStore()
      mockExecute.mockResolvedValueOnce([{ value: 'my-token' }])

      const result = await store.get('server-1:tokens')

      expect(result).toBe('my-token')
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [
        'server-1:tokens',
      ])
    })

    it('get returns undefined when key not found', async () => {
      createStore()
      mockExecute.mockResolvedValueOnce([])

      const result = await store.get('missing-key')
      expect(result).toBeUndefined()
    })

    it('get returns undefined on error', async () => {
      createStore()
      mockExecute.mockRejectedValueOnce(new Error('DB error'))

      const result = await store.get('bad-key')
      expect(result).toBeUndefined()
    })

    it('set upserts value', async () => {
      createStore()
      await store.set('server-1:tokens', '{"access_token":"abc"}')

      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
        'server-1:tokens',
        '{"access_token":"abc"}',
      ])
      const sql = mockExecute.mock.calls[0][0] as string
      expect(sql).toContain('INSERT')
    })

    it('delete removes key', async () => {
      createStore()
      await store.delete('server-1:tokens')

      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('DELETE'), [
        'server-1:tokens',
      ])
    })

    it('delete swallows errors', async () => {
      createStore()
      mockExecute.mockRejectedValueOnce(new Error('DB error'))

      // Should not throw
      await expect(store.delete('bad-key')).resolves.toBeUndefined()
    })
  })
})
