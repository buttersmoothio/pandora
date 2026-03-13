import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiFetch,
  apiFetchRaw,
  authHeaders,
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  getToken,
  refreshTokens,
  setRefreshToken,
  setToken,
} from '../api'

const mockFetch: ReturnType<typeof vi.fn> = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// jsdom may not provide a full localStorage — stub it
const storage: Map<string, string> = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
})

beforeEach(() => {
  storage.clear()
  mockFetch.mockReset()
})

afterEach(() => {
  storage.clear()
})

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

describe('token storage', () => {
  it('getToken returns null when no token is set', () => {
    expect(getToken()).toBeNull()
  })

  it('setToken / getToken round-trip', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
  })

  it('clearToken removes the token', () => {
    setToken('abc')
    clearToken()
    expect(getToken()).toBeNull()
  })

  it('getRefreshToken returns null when no token is set', () => {
    expect(getRefreshToken()).toBeNull()
  })

  it('setRefreshToken / getRefreshToken round-trip', () => {
    setRefreshToken('refresh-abc')
    expect(getRefreshToken()).toBe('refresh-abc')
  })

  it('clearRefreshToken removes the refresh token', () => {
    setRefreshToken('refresh-abc')
    clearRefreshToken()
    expect(getRefreshToken()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// authHeaders
// ---------------------------------------------------------------------------

describe('authHeaders', () => {
  it('returns empty object when no token', () => {
    expect(authHeaders()).toEqual({})
  })

  it('returns Authorization header when token exists', () => {
    setToken('my-token')
    expect(authHeaders()).toEqual({ Authorization: 'Bearer my-token' })
  })
})

// ---------------------------------------------------------------------------
// refreshTokens
// ---------------------------------------------------------------------------

describe('refreshTokens', () => {
  it('returns false when no refresh token exists', async () => {
    expect(await refreshTokens()).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls refresh endpoint and stores new tokens', async () => {
    setRefreshToken('old-refresh')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'new-access', refreshToken: 'new-refresh' }),
    })

    const result = await refreshTokens()
    expect(result).toBe(true)
    expect(getToken()).toBe('new-access')
    expect(getRefreshToken()).toBe('new-refresh')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'old-refresh' }),
      }),
    )
  })

  it('returns false on non-ok response', async () => {
    setRefreshToken('old-refresh')
    mockFetch.mockResolvedValueOnce({ ok: false })

    expect(await refreshTokens()).toBe(false)
  })

  it('returns false on network error', async () => {
    setRefreshToken('old-refresh')
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    expect(await refreshTokens()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// apiFetch
// ---------------------------------------------------------------------------

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'hello' }),
    })

    const result = await apiFetch('/api/test')
    expect(result).toEqual({ data: 'hello' })
  })

  it('includes auth headers when token exists', async () => {
    setToken('my-token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await apiFetch('/api/test')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      }),
    )
  })

  it('throws on non-ok response with error text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
      statusText: 'Not Found',
    })

    await expect(apiFetch('/api/missing')).rejects.toThrow('API error 404: Not found')
  })

  it('falls back to statusText when text() fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('fail')
      },
      statusText: 'Internal Server Error',
    })

    await expect(apiFetch('/api/fail')).rejects.toThrow('API error 500: Internal Server Error')
  })

  it('retries with new token after 401 + successful refresh', async () => {
    setToken('expired')
    setRefreshToken('valid-refresh')

    // First call: 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    // Refresh call: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'fresh-token', refreshToken: 'fresh-refresh' }),
    })
    // Retry call: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ retried: true }),
    })

    const result = await apiFetch('/api/protected')
    expect(result).toEqual({ retried: true })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('returns original 401 response when refresh fails', async () => {
    setToken('expired')
    setRefreshToken('bad-refresh')

    // First call: 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      statusText: 'Unauthorized',
    })
    // Refresh call: fails
    mockFetch.mockResolvedValueOnce({ ok: false })

    await expect(apiFetch('/api/protected')).rejects.toThrow('API error 401')
  })
})

// ---------------------------------------------------------------------------
// apiFetchRaw
// ---------------------------------------------------------------------------

describe('apiFetchRaw', () => {
  it('returns raw Response without parsing', async () => {
    const mockResponse = { ok: true, status: 200 }
    mockFetch.mockResolvedValueOnce(mockResponse)

    const result = await apiFetchRaw('/api/stream')
    expect(result).toBe(mockResponse)
  })
})
