import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AuthTokenPair } from '../../api-types'
import { createClient } from '../create-client'
import { PandoraApiError } from '../fetch-wrapper'

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

type MockFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof mock<MockFetch>>

function client(
  options: {
    getToken?: () => string | null
    refreshToken?: {
      get: () => string | null
      onRefresh: (tokens: AuthTokenPair) => void
    }
  } = {},
): ReturnType<typeof createClient> {
  return createClient({
    baseUrl: 'http://test:4111',
    fetch: fetchMock as MockFetch,
    ...options,
  })
}

beforeEach(() => {
  fetchMock = mock<MockFetch>()
})

afterEach(() => {
  fetchMock.mockRestore()
})

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe('health', () => {
  test('calls GET /', async () => {
    const body = {
      name: 'Pandora',
      version: '1.0',
      runtime: 'bun',
      serverless: false,
      auth: { setup: true, authenticated: true },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(body))

    const result = await client().health()

    expect(result).toEqual(body)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/')
    expect((init as RequestInit).method).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('auth', () => {
  test('login sends POST with password', async () => {
    const tokens: AuthTokenPair = {
      token: 't',
      refreshToken: 'rt',
      expiresAt: '',
      refreshExpiresAt: '',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(tokens))

    const result = await client().auth.login('secret')

    expect(result).toEqual(tokens)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/login')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ password: 'secret' })
  })

  test('setup sends POST with password', async () => {
    const tokens: AuthTokenPair = {
      token: 't',
      refreshToken: 'rt',
      expiresAt: '',
      refreshExpiresAt: '',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(tokens))

    await client().auth.setup('newpass')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/setup')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ password: 'newpass' })
  })

  test('logout sends POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    await client().auth.logout()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/logout')
    expect((init as RequestInit).method).toBe('POST')
  })

  test('sessions sends GET', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sessions: [] }))

    const result = await client().auth.sessions()

    expect(result).toEqual({ sessions: [] })
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/sessions')
  })

  test('revokeSession sends DELETE /:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, loggedOut: false }))

    await client().auth.revokeSession('sess-1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/sessions/sess-1')
    expect((init as RequestInit).method).toBe('DELETE')
  })

  test('revokeAllSessions sends DELETE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    await client().auth.revokeAllSessions()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/sessions')
    expect((init as RequestInit).method).toBe('DELETE')
  })

  test('changePassword sends POST', async () => {
    const tokens: AuthTokenPair = {
      token: 't',
      refreshToken: 'rt',
      expiresAt: '',
      refreshExpiresAt: '',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(tokens))

    await client().auth.changePassword('old', 'new')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/change-password')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      currentPassword: 'old',
      newPassword: 'new',
    })
  })

  test('refresh sends POST with refreshToken', async () => {
    const tokens: AuthTokenPair = {
      token: 't2',
      refreshToken: 'rt2',
      expiresAt: '',
      refreshExpiresAt: '',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(tokens))

    await client().auth.refresh('rt1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/auth/refresh')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ refreshToken: 'rt1' })
  })
})

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

describe('threads', () => {
  test('list sends GET /api/threads', async () => {
    const body = { threads: [], total: 0, page: 1, perPage: 50, hasMore: false }
    fetchMock.mockResolvedValueOnce(jsonResponse(body))

    const result = await client().threads.list()

    expect(result).toEqual(body)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/threads')
  })

  test('get sends GET /api/threads/:id', async () => {
    const body = { thread: { id: 't1' }, messages: [], forks: {}, forkInfo: null }
    fetchMock.mockResolvedValueOnce(jsonResponse(body))

    await client().threads.get('t1')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/threads/t1')
  })

  test('fork sends POST /api/threads/:id/fork', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ thread: { id: 't2' }, clonedMessageCount: 3 }))

    await client().threads.fork('t1', 'msg-5')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/threads/t1/fork')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ messageId: 'msg-5' })
  })

  test('delete sends DELETE /api/threads/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    await client().threads.delete('t1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/threads/t1')
    expect((init as RequestInit).method).toBe('DELETE')
  })
})

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

describe('config', () => {
  test('get sends GET /api/config', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ identity: { name: 'Test' } }))

    await client().config.get()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/config')
  })

  test('update sends PATCH /api/config', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ identity: { name: 'Updated' } }))

    await client().config.update({ identity: { name: 'Updated' } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/config')
    expect((init as RequestInit).method).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

describe('plugins', () => {
  test('list sends GET /api/plugins', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ plugins: [] }))

    await client().plugins.list()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/plugins')
  })
})

describe('mcpServers', () => {
  test('list sends GET /api/mcp-servers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ servers: [] }))

    await client().mcpServers.list()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/mcp-servers')
  })

  test('add sends POST /api/mcp-servers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'srv-1' }))

    await client().mcpServers.add({ url: 'http://mcp.test', name: 'Test' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/mcp-servers')
    expect((init as RequestInit).method).toBe('POST')
  })
})

describe('models', () => {
  test('list sends GET /api/models', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ providers: [] }))

    await client().models.list()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/models')
  })
})

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

describe('schedule', () => {
  test('list sends GET /api/schedule', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ enabled: true, tasks: [] }))

    await client().schedule.list()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule')
  })

  test('create sends POST /api/schedule', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 's1', name: 'Test' }))

    await client().schedule.create({ name: 'Test', prompt: 'Do stuff', cron: '0 * * * *' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule')
    expect((init as RequestInit).method).toBe('POST')
  })

  test('update sends PATCH /api/schedule/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 's1' }))

    await client().schedule.update('s1', { name: 'Updated' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule/s1')
    expect((init as RequestInit).method).toBe('PATCH')
  })

  test('delete sends DELETE /api/schedule/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: 's1' }))

    await client().schedule.delete('s1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule/s1')
    expect((init as RequestInit).method).toBe('DELETE')
  })

  test('destinations sends GET /api/schedule/destinations', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ destinations: ['Web Inbox'] }))

    await client().schedule.destinations()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule/destinations')
  })

  test('heartbeat sends GET /api/schedule/heartbeat', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ enabled: false, cron: '', tasks: [] }))

    await client().schedule.heartbeat()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule/heartbeat')
  })

  test('updateHeartbeat sends PATCH /api/schedule/heartbeat', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ enabled: true }))

    await client().schedule.updateHeartbeat({ enabled: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/schedule/heartbeat')
    expect((init as RequestInit).method).toBe('PATCH')
  })
})

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

describe('inbox', () => {
  test('list sends GET /api/inbox', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [] }))

    await client().inbox.list()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/inbox')
  })

  test('list with archived sends ?archived=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [] }))

    await client().inbox.list({ archived: true })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/inbox?archived=true')
  })

  test('get sends GET /api/inbox/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'i1' }))

    await client().inbox.get('i1')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/inbox/i1')
  })

  test('update sends PATCH /api/inbox/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'i1', read: true }))

    await client().inbox.update('i1', { read: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/inbox/i1')
    expect((init as RequestInit).method).toBe('PATCH')
  })

  test('delete sends DELETE /api/inbox/:id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: 'i1' }))

    await client().inbox.delete('i1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/inbox/i1')
    expect((init as RequestInit).method).toBe('DELETE')
  })
})

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

describe('memory', () => {
  test('getWorkingMemory sends GET /api/memory/working', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: 'test' }))

    await client().memory.getWorkingMemory()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/memory/working')
  })

  test('updateWorkingMemory sends PUT /api/memory/working', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: 'updated' }))

    await client().memory.updateWorkingMemory('updated')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/memory/working')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ content: 'updated' })
  })

  test('getObservations sends GET /api/memory/observations', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ observations: null }))

    await client().memory.getObservations()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/memory/observations')
  })

  test('getRecord sends GET /api/memory/record', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ record: null, thresholds: null }))

    await client().memory.getRecord()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/memory/record')
  })
})

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

describe('chat', () => {
  test('send returns raw Response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: hello\n\n', { status: 200 }))

    const res = await client().chat.send({ parts: [{ type: 'text', text: 'hi' }] })

    expect(res).toBeInstanceOf(Response)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/chat')
    expect((init as RequestInit).method).toBe('POST')
  })

  test('approve returns raw Response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: ok\n\n', { status: 200 }))

    const res = await client().chat.approve({
      runId: 'r1',
      threadId: 't1',
      toolCallId: 'tc1',
      approved: true,
    })

    expect(res).toBeInstanceOf(Response)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/chat/approve')
  })

  test('resume returns null on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const res = await client().chat.resume('t1')

    expect(res).toBeNull()
  })

  test('resume returns Response on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: stream\n\n', { status: 200 }))

    const res = await client().chat.resume('t1')

    expect(res).toBeInstanceOf(Response)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/api/chat/t1/stream')
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  test('throws PandoraApiError on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('Not Found', 404))

    try {
      await client().threads.get('nonexistent')
      expect(true).toBe(false) // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(PandoraApiError)
      const apiErr = err as PandoraApiError
      expect(apiErr.status).toBe(404)
      expect(apiErr.body).toBe('Not Found')
    }
  })

  test('includes status and body in error message', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('Bad Request', 400))

    try {
      await client().config.update({})
      expect(true).toBe(false)
    } catch (err) {
      expect((err as PandoraApiError).message).toBe('API error 400: Bad Request')
    }
  })
})

// ---------------------------------------------------------------------------
// Auth headers
// ---------------------------------------------------------------------------

describe('auth headers', () => {
  test('includes Authorization header when getToken returns a token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ plugins: [] }))

    await client({ getToken: () => 'my-token' }).plugins.list()

    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-token')
  })

  test('omits Authorization header when getToken returns null', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ plugins: [] }))

    await client({ getToken: () => null }).plugins.list()

    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Token refresh on 401
// ---------------------------------------------------------------------------

describe('token refresh', () => {
  test('retries request after successful refresh', async () => {
    let currentToken = 'expired'
    const refreshedTokens: AuthTokenPair = {
      token: 'new-token',
      refreshToken: 'new-rt',
      expiresAt: '',
      refreshExpiresAt: '',
    }

    // First call: 401
    // Second call: refresh endpoint
    // Third call: retry original
    fetchMock
      .mockResolvedValueOnce(textResponse('Unauthorized', 401))
      .mockResolvedValueOnce(jsonResponse(refreshedTokens))
      .mockResolvedValueOnce(jsonResponse({ plugins: [] }))

    const c = client({
      getToken: () => currentToken,
      refreshToken: {
        get: () => 'my-refresh-token',
        onRefresh: (tokens: AuthTokenPair) => {
          currentToken = tokens.token
        },
      },
    })

    const result = await c.plugins.list()

    expect(result).toEqual({ plugins: [] })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Verify refresh was called correctly
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toBe('http://test:4111/api/auth/refresh')
    expect(JSON.parse((refreshInit as RequestInit).body as string)).toEqual({
      refreshToken: 'my-refresh-token',
    })

    // Verify retry used new token
    const [, retryInit] = fetchMock.mock.calls[2]
    const retryHeaders = (retryInit as RequestInit).headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer new-token')
  })

  test('throws PandoraApiError when refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse('Unauthorized', 401))
      .mockResolvedValueOnce(textResponse('Invalid refresh token', 401))

    const c = client({
      getToken: () => 'expired',
      refreshToken: {
        get: () => 'bad-rt',
        onRefresh: () => {},
      },
    })

    try {
      await c.plugins.list()
      expect(true).toBe(false)
    } catch (err) {
      // Without refresh, the original 401 response becomes a PandoraApiError
      expect(err).toBeInstanceOf(PandoraApiError)
      expect((err as PandoraApiError).status).toBe(401)
    }
  })

  test('throws PandoraApiError on 401 when no refreshToken configured', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('Unauthorized', 401))

    try {
      await client({ getToken: () => 'expired' }).plugins.list()
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(PandoraApiError)
      expect((err as PandoraApiError).status).toBe(401)
    }
  })
})

// ---------------------------------------------------------------------------
// Default baseUrl
// ---------------------------------------------------------------------------

describe('defaults', () => {
  test('uses localhost:4111 as default baseUrl', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: 'Pandora' }))

    const c = createClient({ fetch: fetchMock as MockFetch })
    await c.health()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:4111/')
  })

  test('strips trailing slashes from baseUrl', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: 'Pandora' }))

    const c = createClient({ baseUrl: 'http://test:4111/', fetch: fetchMock as MockFetch })
    await c.health()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test:4111/')
  })
})
