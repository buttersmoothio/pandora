import { describe, expect, it } from 'vitest'
import { factory } from './index'

describe('LibSQL vector plugin', () => {
  it('exports a factory function', () => {
    expect(typeof factory).toBe('function')
  })

  it('creates vector instance with in-memory database', async () => {
    const { vector } = await factory({ DATABASE_URL: ':memory:' })
    expect(vector).toBeDefined()
  })
})
