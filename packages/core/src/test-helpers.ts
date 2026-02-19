import app from './index'

// Mock environment for tests
export const TEST_ENV = {
  NODE_ENV: 'test',
}

// Request helper for Hono app
export function request(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

const TEST_PASSWORD = 'test-password-1234'

// Cached auth token for protected route tests
let _authToken: string | null = null

/**
 * Authenticated request helper.
 * Calls POST /api/auth/setup on first use (or /api/auth/login if already set up)
 * to get a token, then includes `Authorization: Bearer <token>` on all subsequent calls.
 */
export async function authRequest(path: string, init?: RequestInit) {
  if (!_authToken) {
    // Try setup first
    const setupRes = await request('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })

    if (setupRes.status === 201) {
      const body = (await setupRes.json()) as { token: string }
      _authToken = body.token
    } else {
      // Already set up — login instead
      const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
      const body = (await loginRes.json()) as { token: string }
      _authToken = body.token
    }
  }

  return app.request(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${_authToken}`,
      ...init?.headers,
    },
  })
}

/**
 * Reset the cached auth token. Call in afterAll/beforeAll if needed.
 */
export function resetAuthToken() {
  _authToken = null
}
