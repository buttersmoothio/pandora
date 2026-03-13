import { describe, expect, it } from 'vitest'
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  timingSafeEqual,
  verifyPassword,
} from '../crypto'

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies a password', async () => {
    const result = await hashPassword('my-secret-password', 1000) // Low iterations for test speed
    expect(result.hash).toBeTruthy()
    expect(result.salt).toBeTruthy()
    expect(result.iterations).toBe(1000)

    const valid = await verifyPassword('my-secret-password', result)
    expect(valid).toBe(true)
  })

  it('rejects wrong password', async () => {
    const result = await hashPassword('correct-password', 1000)
    const valid = await verifyPassword('wrong-password', result)
    expect(valid).toBe(false)
  })

  it('produces different hashes for same password (random salt)', async () => {
    const a = await hashPassword('same-password', 1000)
    const b = await hashPassword('same-password', 1000)
    expect(a.hash).not.toBe(b.hash)
    expect(a.salt).not.toBe(b.salt)
  })
})

describe('generateSessionToken / hashToken', () => {
  it('generates a token and matching hash', async () => {
    const { token, tokenHash } = await generateSessionToken()
    expect(token).toBeTruthy()
    expect(tokenHash).toBeTruthy()
    expect(token.length).toBeGreaterThan(10)
    expect(tokenHash.length).toBe(64) // SHA-256 hex = 64 chars

    // hashToken should produce the same hash
    const computed = await hashToken(token)
    expect(computed).toBe(tokenHash)
  })

  it('generates unique tokens', async () => {
    const a = await generateSessionToken()
    const b = await generateSessionToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe('timingSafeEqual', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true)
  })

  it('returns false for different strings', () => {
    expect(timingSafeEqual('hello', 'world')).toBe(false)
  })

  it('returns false for different lengths', () => {
    expect(timingSafeEqual('short', 'longer')).toBe(false)
  })

  it('returns true for empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true)
  })
})
