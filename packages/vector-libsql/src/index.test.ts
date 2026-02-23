import { describe, expect, it } from 'vitest'
import plugin from './index'

describe('LibSQL vector plugin', () => {
  describe('plugin definition', () => {
    it('has required plugin properties', () => {
      expect(plugin.id).toBe('vector-libsql')
      expect(plugin.name).toBe('SQLite Vector')
      expect(plugin.schemaVersion).toBe(1)
      expect(typeof plugin.factory).toBe('function')
    })
  })

  describe('factory', () => {
    it('creates vector instance with in-memory database', async () => {
      const { vector } = await plugin.factory({ DATABASE_URL: ':memory:' })
      expect(vector).toBeDefined()
    })
  })
})
