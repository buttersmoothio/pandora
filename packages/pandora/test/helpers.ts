import app from '../src/index'

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
