import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpOAuthStore } from './oauth-store'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListTools = vi.fn().mockResolvedValue({})
const mockDisconnect = vi.fn()

vi.mock('@mastra/mcp', () => ({
  MCPClient: vi.fn(() => ({
    listTools: mockListTools,
    disconnect: mockDisconnect,
  })),
  MCPOAuthClientProvider: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  discoverOAuthProtectedResourceMetadata: vi.fn(),
  discoverAuthorizationServerMetadata: vi.fn(),
  exchangeAuthorization: vi.fn(),
}))

const { MCPClient } = await import('@mastra/mcp')
const { createMcpManager } = await import('./mcp-manager')

function mockConfig(mcpServers: Record<string, unknown> = {}) {
  return { mcpServers } as never
}

function mockOAuthStore(overrides: Partial<McpOAuthStore> = {}): McpOAuthStore {
  return {
    init: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMcpManager', () => {
  beforeEach(() => {
    vi.mocked(MCPClient).mockClear()
    mockListTools.mockReset().mockResolvedValue({})
    mockDisconnect.mockReset()
  })

  it('returns empty manager when no servers configured', async () => {
    const manager = await createMcpManager(mockConfig(), {})

    expect(manager.tools).toEqual({})
    expect(manager.serverMeta.size).toBe(0)
    expect(MCPClient).not.toHaveBeenCalled()
  })

  it('returns empty manager when mcpServers is empty object', async () => {
    const manager = await createMcpManager(mockConfig({}), {})

    expect(manager.tools).toEqual({})
    expect(manager.serverMeta.size).toBe(0)
  })

  it('empty manager handleOAuthCallback throws', async () => {
    const manager = await createMcpManager(mockConfig(), {})

    await expect(manager.handleOAuthCallback('code', 'state')).rejects.toThrow(
      'No MCP servers configured',
    )
  })

  describe('stdio mode', () => {
    it('builds stdio definition from command config', async () => {
      mockListTools.mockResolvedValueOnce({})

      await createMcpManager(
        mockConfig({
          myserver: { command: '/usr/bin/mcp-server', args: ['--port', '3000'] },
        }),
        {},
      )

      expect(MCPClient).toHaveBeenCalledWith({
        id: 'pandora-mcp',
        servers: {
          myserver: {
            command: '/usr/bin/mcp-server',
            args: ['--port', '3000'],
            env: {},
          },
        },
      })
    })

    it('forwards specified env vars to stdio process', async () => {
      mockListTools.mockResolvedValueOnce({})

      await createMcpManager(
        mockConfig({
          myserver: { command: 'mcp', env: ['API_KEY', 'MISSING_VAR'] },
        }),
        { API_KEY: 'secret', OTHER: 'ignored' },
      )

      expect(MCPClient).toHaveBeenCalledWith({
        id: 'pandora-mcp',
        servers: {
          myserver: {
            command: 'mcp',
            args: [],
            env: { API_KEY: 'secret' },
          },
        },
      })
    })
  })

  describe('HTTP mode', () => {
    it('builds HTTP definition from url config', async () => {
      mockListTools.mockResolvedValueOnce({})

      await createMcpManager(
        mockConfig({
          remote: { url: 'https://mcp.example.com/sse' },
        }),
        {},
      )

      expect(MCPClient).toHaveBeenCalledWith({
        id: 'pandora-mcp',
        servers: {
          remote: { url: new URL('https://mcp.example.com/sse') },
        },
      })
    })

    it('injects custom headers via custom fetch', async () => {
      mockListTools.mockResolvedValueOnce({})

      await createMcpManager(
        mockConfig({
          remote: {
            url: 'https://mcp.example.com/sse',
            headers: { Authorization: 'Bearer token' },
          },
        }),
        {},
      )

      const call = vi.mocked(MCPClient).mock.calls[0][0]
      const def = (call as { servers: Record<string, { fetch?: unknown }> }).servers.remote
      expect(def.fetch).toBeTypeOf('function')
    })

    it('skips OAuth when BASE_URL is not set', async () => {
      mockListTools.mockResolvedValueOnce({})

      const manager = await createMcpManager(
        mockConfig({
          remote: { url: 'https://mcp.example.com/sse', oauth: true },
        }),
        {},
        mockOAuthStore(),
      )

      // Should still create the server, just without OAuth
      expect(manager.serverMeta.get('remote')).toBeDefined()
    })

    it('builds OAuth definition when oauth + BASE_URL set', async () => {
      mockListTools.mockResolvedValueOnce({})

      await createMcpManager(
        mockConfig({
          remote: { url: 'https://mcp.example.com/sse', oauth: true },
        }),
        { BASE_URL: 'https://pandora.test' },
        mockOAuthStore(),
      )

      const call = vi.mocked(MCPClient).mock.calls[0][0]
      const def = (call as { servers: Record<string, { authProvider?: unknown }> }).servers.remote
      expect(def.authProvider).toBeDefined()
    })
  })

  describe('disabled servers', () => {
    it('includes disabled server in metadata but not in MCPClient', async () => {
      mockListTools.mockResolvedValueOnce({})

      const manager = await createMcpManager(
        mockConfig({
          active: { url: 'https://active.test' },
          inactive: { url: 'https://inactive.test', enabled: false },
        }),
        {},
      )

      expect(manager.serverMeta.get('inactive')).toEqual(
        expect.objectContaining({ id: 'inactive', enabled: false }),
      )
      // MCPClient should only receive the active server
      const call = vi.mocked(MCPClient).mock.calls[0][0]
      const servers = (call as { servers: Record<string, unknown> }).servers
      expect(servers).not.toHaveProperty('inactive')
      expect(servers).toHaveProperty('active')
    })

    it('returns metadata without creating MCPClient when all disabled', async () => {
      vi.mocked(MCPClient).mockClear()

      const manager = await createMcpManager(
        mockConfig({
          inactive: { url: 'https://inactive.test', enabled: false },
        }),
        {},
      )

      expect(MCPClient).not.toHaveBeenCalled()
      expect(manager.serverMeta.get('inactive')).toBeDefined()
    })
  })

  describe('tool registration', () => {
    it('registers tools with requireApproval from config', async () => {
      mockListTools.mockResolvedValueOnce({
        myserver_search: { description: 'Search tool' },
        myserver_write: { description: 'Write tool' },
      })

      const manager = await createMcpManager(
        mockConfig({ myserver: { url: 'https://test.com' } }),
        {},
      )

      expect(Object.keys(manager.tools)).toEqual(['myserver_search', 'myserver_write'])
      // Default requireApproval is true
      expect((manager.tools.myserver_search as { requireApproval?: boolean }).requireApproval).toBe(
        true,
      )
    })

    it('does not force requireApproval when config sets it to false', async () => {
      mockListTools.mockResolvedValueOnce({
        myserver_search: { description: 'Search tool' },
      })

      const manager = await createMcpManager(
        mockConfig({
          myserver: { url: 'https://test.com', requireApproval: false },
        }),
        {},
      )

      expect(
        (manager.tools.myserver_search as { requireApproval?: boolean }).requireApproval,
      ).toBeUndefined()
    })

    it('populates server meta with tool info', async () => {
      mockListTools.mockResolvedValueOnce({
        srv_tool1: {
          description: 'A tool',
          mcp: { annotations: { title: 'Custom Name' } },
        },
      })

      const manager = await createMcpManager(mockConfig({ srv: { url: 'https://test.com' } }), {})

      const meta = manager.serverMeta.get('srv')
      expect(meta?.tools).toEqual([{ id: 'srv_tool1', name: 'Custom Name', description: 'A tool' }])
    })

    it('falls back to short name when no annotation title', async () => {
      mockListTools.mockResolvedValueOnce({
        srv_my_tool: { description: 'A tool' },
      })

      const manager = await createMcpManager(mockConfig({ srv: { url: 'https://test.com' } }), {})

      const meta = manager.serverMeta.get('srv')
      expect(meta?.tools[0].name).toBe('my_tool')
    })

    it('handles tool loading failure gracefully', async () => {
      mockListTools.mockRejectedValueOnce(new Error('Connection refused'))

      const manager = await createMcpManager(mockConfig({ srv: { url: 'https://test.com' } }), {})

      // Should still return a manager, just with no tools
      expect(Object.keys(manager.tools)).toEqual([])
      expect(manager.serverMeta.get('srv')).toBeDefined()
    })
  })

  describe('server metadata', () => {
    it('uses config name or falls back to id', async () => {
      mockListTools.mockResolvedValueOnce({})

      const manager = await createMcpManager(
        mockConfig({
          unnamed: { url: 'https://test.com' },
          named: { url: 'https://test.com', name: 'My Server' },
        }),
        {},
      )

      expect(manager.serverMeta.get('unnamed')?.name).toBe('unnamed')
      expect(manager.serverMeta.get('named')?.name).toBe('My Server')
    })

    it('detects type from config (stdio vs http)', async () => {
      mockListTools.mockResolvedValueOnce({})

      const manager = await createMcpManager(
        mockConfig({
          local: { command: 'mcp-local' },
          remote: { url: 'https://remote.test' },
        }),
        {},
      )

      expect(manager.serverMeta.get('local')?.type).toBe('stdio')
      expect(manager.serverMeta.get('remote')?.type).toBe('http')
    })

    it('captures config errors in meta', async () => {
      mockListTools.mockResolvedValueOnce({})

      // A server with neither command nor url will fail buildDef
      // but the config Zod schema requires one, so simulate a runtime error
      // by using a broken URL
      const badConfig = mockConfig({
        good: { url: 'https://good.test' },
      })
      // Manually add a bad server that bypasses Zod validation
      ;(badConfig.mcpServers as Record<string, unknown>).bad = {
        url: 'not-a-url',
        enabled: true,
      }

      const manager = await createMcpManager(badConfig, {})

      const badMeta = manager.serverMeta.get('bad')
      expect(badMeta?.error).toBeDefined()
    })
  })

  describe('disconnect', () => {
    it('calls client.disconnect', async () => {
      mockListTools.mockResolvedValueOnce({})
      mockDisconnect.mockResolvedValueOnce(undefined)

      const manager = await createMcpManager(mockConfig({ srv: { url: 'https://test.com' } }), {})

      await manager.disconnect()
      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('handles disconnect errors gracefully', async () => {
      mockListTools.mockResolvedValueOnce({})
      mockDisconnect.mockRejectedValueOnce(new Error('already closed'))

      const manager = await createMcpManager(mockConfig({ srv: { url: 'https://test.com' } }), {})

      // Should not throw
      await expect(manager.disconnect()).resolves.toBeUndefined()
    })
  })

  describe('handleOAuthCallback', () => {
    it('throws when no OAuth store', async () => {
      mockListTools.mockResolvedValueOnce({})

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        {},
        // no oauthStore
      )

      await expect(manager.handleOAuthCallback('code', 'state')).rejects.toThrow(
        'OAuth store not available',
      )
    })

    it('throws when state lookup fails', async () => {
      mockListTools.mockResolvedValueOnce({})
      const store = mockOAuthStore({ get: vi.fn().mockResolvedValue(undefined) })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        {},
        store,
      )

      await expect(manager.handleOAuthCallback('code', 'bad-state')).rejects.toThrow(
        'Invalid or expired OAuth state',
      )
      expect(store.get).toHaveBeenCalledWith('state:bad-state')
    })

    it('throws when state has expired', async () => {
      mockListTools.mockResolvedValueOnce({})
      const expiredState = JSON.stringify({
        serverId: 'srv',
        createdAt: Date.now() - 11 * 60 * 1000, // 11 minutes ago
      })
      const store = mockOAuthStore({
        get: vi.fn().mockResolvedValue(expiredState),
      })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        {},
        store,
      )

      await expect(manager.handleOAuthCallback('code', 'state')).rejects.toThrow(
        'OAuth state has expired',
      )
      expect(store.delete).toHaveBeenCalledWith('state:state')
    })

    it('throws when server not found in config', async () => {
      mockListTools.mockResolvedValueOnce({})
      const store = mockOAuthStore({
        get: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ serverId: 'nonexistent-server', createdAt: Date.now() }),
          ),
      })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        {},
        store,
      )

      await expect(manager.handleOAuthCallback('code', 'state')).rejects.toThrow(
        'not found or has no URL',
      )
    })

    it('throws when BASE_URL is not set', async () => {
      mockListTools.mockResolvedValueOnce({})
      const store = mockOAuthStore({
        get: vi.fn().mockResolvedValue(JSON.stringify({ serverId: 'srv', createdAt: Date.now() })),
      })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        {}, // no BASE_URL
        store,
      )

      await expect(manager.handleOAuthCallback('code', 'state')).rejects.toThrow(
        'BASE_URL env var not configured',
      )
    })

    it('throws when code verifier is missing', async () => {
      mockListTools.mockResolvedValueOnce({})
      const store = mockOAuthStore({
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'state:my-state')
            return JSON.stringify({ serverId: 'srv', createdAt: Date.now() })
          return undefined // missing code_verifier
        }),
      })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        { BASE_URL: 'https://pandora.test' },
        store,
      )

      await expect(manager.handleOAuthCallback('code', 'my-state')).rejects.toThrow(
        'Missing code verifier',
      )
    })

    it('throws when client info is missing', async () => {
      mockListTools.mockResolvedValueOnce({})
      const store = mockOAuthStore({
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'state:my-state')
            return JSON.stringify({ serverId: 'srv', createdAt: Date.now() })
          if (key === 'srv:code_verifier') return 'verifier123'
          return undefined // missing client_info
        }),
      })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        { BASE_URL: 'https://pandora.test' },
        store,
      )

      await expect(manager.handleOAuthCallback('code', 'my-state')).rejects.toThrow(
        'Missing client info',
      )
    })

    it('exchanges code and stores tokens on success', async () => {
      mockListTools.mockResolvedValueOnce({})

      const mockTokens = { access_token: 'at', refresh_token: 'rt' }
      const {
        exchangeAuthorization,
        discoverOAuthProtectedResourceMetadata,
        discoverAuthorizationServerMetadata,
      } = await import('@modelcontextprotocol/sdk/client/auth.js')
      vi.mocked(discoverOAuthProtectedResourceMetadata).mockResolvedValueOnce({
        resource: 'https://test.com',
        authorization_servers: ['https://auth.test.com'],
      } as never)
      vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValueOnce({
        issuer: 'https://auth.test.com',
        authorization_endpoint: 'https://auth.test.com/authorize',
        token_endpoint: 'https://auth.test.com/token',
      } as never)
      vi.mocked(exchangeAuthorization).mockResolvedValueOnce(mockTokens as never)

      const store = mockOAuthStore({
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'state:my-state')
            return JSON.stringify({ serverId: 'srv', createdAt: Date.now() })
          if (key === 'srv:code_verifier') return 'verifier123'
          if (key === 'srv:client_info') return '{"client_id":"cid"}'
          return undefined
        }),
      })

      const manager = await createMcpManager(
        mockConfig({ srv: { url: 'https://test.com' } }),
        { BASE_URL: 'https://pandora.test' },
        store,
      )

      const serverId = await manager.handleOAuthCallback('auth-code', 'my-state')

      expect(serverId).toBe('srv')
      // Tokens stored
      expect(store.set).toHaveBeenCalledWith('srv:tokens', JSON.stringify(mockTokens))
      // State cleaned up
      expect(store.delete).toHaveBeenCalledWith('state:my-state')
    })
  })
})
