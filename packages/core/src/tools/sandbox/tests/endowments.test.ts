import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEndowments, createPluginConsole, isPrivateHostname } from '../endowments'

const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

vi.mock('../../../logger', () => ({
  getLogger: () => mockLogger,
}))

describe('buildEndowments', () => {
  it('returns only console with empty permissions', () => {
    const endowments = buildEndowments({}, {})
    expect(endowments.console).toBeDefined()
    expect(endowments.fetch).toBeUndefined()
    expect(endowments.env).toBeUndefined()
    expect(endowments.readFile).toBeUndefined()
    expect(endowments.Date).toBeUndefined()
    expect(endowments.Intl).toBeUndefined()
    expect(endowments.Math).toBeUndefined()
  })

  describe('time permission', () => {
    it('endows Date and Intl when time: true', () => {
      const endowments = buildEndowments({ time: true }, {})
      expect(endowments.Date).toBe(Date)
      expect(endowments.Intl).toBe(Intl)
    })

    it('omits Date and Intl when time is falsy', () => {
      const endowments = buildEndowments({ time: false }, {})
      expect(endowments.Date).toBeUndefined()
      expect(endowments.Intl).toBeUndefined()
    })
  })

  describe('network permission', () => {
    it('creates scoped fetch for declared hostnames', () => {
      const endowments = buildEndowments({ network: ['api.example.com'] }, {})
      expect(endowments.fetch).toBeDefined()
      expect(typeof endowments.fetch).toBe('function')
    })

    it('scoped fetch allows declared hostnames', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
      vi.stubGlobal('fetch', mockFetch)

      const { fetch: scopedFetch } = buildEndowments({ network: ['api.example.com'] }, {})
      expect(scopedFetch).toBeDefined()
      await scopedFetch?.('https://api.example.com/data')
      expect(mockFetch).toHaveBeenCalledOnce()

      vi.unstubAllGlobals()
    })

    it('scoped fetch blocks undeclared hostnames', async () => {
      const { fetch: scopedFetch } = buildEndowments({ network: ['api.example.com'] }, {})
      expect(scopedFetch).toBeDefined()
      await expect(scopedFetch?.('https://evil.com/steal')).rejects.toThrow('Network denied')
    })

    it('scoped fetch blocks private IPs (SSRF)', async () => {
      const { fetch: scopedFetch } = buildEndowments({ network: ['localhost'] }, {})
      expect(scopedFetch).toBeDefined()
      await expect(scopedFetch?.('https://localhost/internal')).rejects.toThrow('SSRF blocked')
    })

    it('scoped fetch with multiple hosts allows all declared', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
      vi.stubGlobal('fetch', mockFetch)

      const { fetch: scopedFetch } = buildEndowments(
        { network: ['a.example.com', 'b.example.com'] },
        {},
      )
      await scopedFetch?.('https://a.example.com/data')
      await scopedFetch?.('https://b.example.com/data')
      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.unstubAllGlobals()
    })

    it('scoped fetch rejects file:// protocol', async () => {
      const { fetch: scopedFetch } = buildEndowments({ network: [''] }, {})
      expect(scopedFetch).toBeDefined()
      await expect(scopedFetch?.('file:///etc/passwd')).rejects.toThrow()
    })

    it('omits fetch with empty network array', () => {
      const endowments = buildEndowments({ network: [] }, {})
      expect(endowments.fetch).toBeUndefined()
    })
  })

  describe('env permission', () => {
    it('creates scoped env reader for declared keys', () => {
      const { env } = buildEndowments({ env: ['API_KEY'] }, { API_KEY: 'secret' })
      expect(env).toBeDefined()
      expect(env?.get('API_KEY')).toBe('secret')
    })

    it('scoped env blocks undeclared keys', () => {
      const { env } = buildEndowments({ env: ['API_KEY'] }, { API_KEY: 'a', SECRET: 'b' })
      expect(env?.get('SECRET')).toBeUndefined()
    })

    it('scoped env snapshots values at construction time', () => {
      const envVars: Record<string, string | undefined> = { KEY: 'original' }
      const { env } = buildEndowments({ env: ['KEY'] }, envVars)
      envVars.KEY = 'changed'
      expect(env?.get('KEY')).toBe('original')
    })

    it('omits env with empty array', () => {
      const endowments = buildEndowments({ env: [] }, {})
      expect(endowments.env).toBeUndefined()
    })
  })

  describe('random permission', () => {
    it('provides Math.random when random: true', () => {
      const endowments = buildEndowments({ random: true }, {})
      expect(endowments.Math).toBeDefined()
      const value = endowments.Math?.random()
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    })

    it('omits Math when random is falsy', () => {
      const endowments = buildEndowments({ random: false }, {})
      expect(endowments.Math).toBeUndefined()
    })
  })

  describe('fs permission', () => {
    it('creates scoped readFile for declared paths', () => {
      const endowments = buildEndowments({ fs: ['/data/exports'] }, {})
      expect(endowments.readFile).toBeDefined()
      expect(typeof endowments.readFile).toBe('function')
    })

    it('scoped readFile blocks paths outside allowed prefixes', async () => {
      const { readFile } = buildEndowments({ fs: ['/data/exports'] }, {})
      expect(readFile).toBeDefined()
      await expect(readFile?.('/etc/passwd')).rejects.toThrow('Filesystem denied')
    })

    it('scoped readFile blocks path traversal', async () => {
      const { readFile } = buildEndowments({ fs: ['/data/exports'] }, {})
      expect(readFile).toBeDefined()
      await expect(readFile?.('/data/exports/../../etc/passwd')).rejects.toThrow(
        'Filesystem denied',
      )
    })

    it('omits readFile with empty array', () => {
      const endowments = buildEndowments({ fs: [] }, {})
      expect(endowments.readFile).toBeUndefined()
    })
  })

  describe('hardening', () => {
    it('endowed fetch is frozen', () => {
      const endowments = buildEndowments({ network: ['example.com'] }, {})
      expect(Object.isFrozen(endowments.fetch)).toBe(true)
    })

    it('endowed env is frozen', () => {
      const endowments = buildEndowments({ env: ['KEY'] }, { KEY: 'val' })
      expect(Object.isFrozen(endowments.env)).toBe(true)
    })

    it('endowed Math is frozen', () => {
      const endowments = buildEndowments({ random: true }, {})
      expect(Object.isFrozen(endowments.Math)).toBe(true)
    })
  })
})

describe('isPrivateHostname', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['192.168.255.255', true],
    ['169.254.1.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['localhost', true],
    ['LOCALHOST', true],
    ['fc00::1', true],
    ['fe80::1', true],
    ['8.8.8.8', false],
    ['api.example.com', false],
    ['172.32.0.1', false],
    ['192.169.0.1', false],
  ])('%s → %s', (hostname, expected) => {
    expect(isPrivateHostname(hostname)).toBe(expected)
  })
})

describe('createPluginConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes log to logger.debug with plugin tag', () => {
    const pc = createPluginConsole('my-plugin')
    pc.log('hello', 'world')
    expect(mockLogger.debug).toHaveBeenCalledWith('hello world', { plugin: 'plugin:my-plugin' })
  })

  it('routes warn to logger.warn with plugin tag', () => {
    const pc = createPluginConsole('my-plugin')
    pc.warn('danger')
    expect(mockLogger.warn).toHaveBeenCalledWith('danger', { plugin: 'plugin:my-plugin' })
  })

  it('routes error to logger.error with plugin tag', () => {
    const pc = createPluginConsole('my-plugin')
    pc.error('failed')
    expect(mockLogger.error).toHaveBeenCalledWith('failed', { plugin: 'plugin:my-plugin' })
  })

  it('is frozen', () => {
    const pc = createPluginConsole('test')
    expect(Object.isFrozen(pc)).toBe(true)
  })
})
