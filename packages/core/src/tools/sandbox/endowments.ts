// Ensure SES lockdown has run (idempotent — index.ts also imports this)
import '../../ses-lockdown'

import path from 'node:path'
import { getLogger } from '../../logger'
import type { ToolPermissions } from '../types'

/** Logger interface provided to plugins via console (compartment) or context (host). */
export type PluginLogger = Pick<Console, 'log' | 'warn' | 'error'>

/**
 * Endowments object passed as globals to a SES Compartment.
 * Only capabilities matching the declared permissions are present.
 */
export interface Endowments {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  env?: { get: (key: string) => string | undefined }
  readFile?: (path: string) => Promise<string>
  Date?: typeof Date
  Intl?: typeof Intl
  Math?: { random: () => number }
  console: PluginLogger
}

// --- SSRF protection ---

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
]

/** Check if a hostname points to a private/internal address. */
export function isPrivateHostname(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))
}

// --- Individual endowment factories ---

/**
 * Scoped fetch: only allows requests to declared hostnames.
 * Blocks private/internal IPs (SSRF protection).
 */
function createScopedFetch(allowedHosts: string[]): Endowments['fetch'] {
  const allowed = new Set(allowedHosts)

  return harden(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url)
    if (!allowed.has(parsed.hostname)) {
      throw new Error(`Network denied: ${parsed.hostname} is not in allowed list`)
    }
    if (isPrivateHostname(parsed.hostname)) {
      throw new Error(`SSRF blocked: ${parsed.hostname} resolves to a private address`)
    }
    return fetch(url, init)
  })
}

/**
 * Scoped env reader: only exposes declared keys.
 * Takes a snapshot at construction time.
 */
function createScopedEnv(
  allowedKeys: string[],
  envVars: Record<string, string | undefined>,
): Endowments['env'] {
  const snapshot: Record<string, string | undefined> = {}
  for (const key of allowedKeys) {
    snapshot[key] = envVars[key]
  }
  return harden({ get: (key: string) => snapshot[key] })
}

/**
 * Scoped filesystem reader: only allows paths under declared prefixes.
 */
function createScopedReadFile(allowedPaths: string[]): Endowments['readFile'] {
  const roots = allowedPaths.map((p) => path.resolve(p))

  return harden(async (filePath: string) => {
    const resolved = path.resolve(filePath)
    if (!roots.some((root) => resolved.startsWith(root))) {
      throw new Error(`Filesystem denied: ${filePath}`)
    }
    const file = Bun.file(resolved)
    return file.text()
  })
}

/**
 * Create a plugin-scoped console that routes through the structured logger.
 *
 * - `console.log` → `logger.debug` (plugin output is verbose by default)
 * - `console.warn` → `logger.warn`
 * - `console.error` → `logger.error`
 */
export function createPluginConsole(pluginId: string): PluginLogger {
  const log = getLogger()
  const tag = `plugin:${pluginId}`
  const fmt = (args: unknown[]) => args.map(String).join(' ')
  return harden({
    log: (...args: unknown[]) => log.debug(fmt(args), { plugin: tag }),
    warn: (...args: unknown[]) => log.warn(fmt(args), { plugin: tag }),
    error: (...args: unknown[]) => log.error(fmt(args), { plugin: tag }),
  })
}

// --- Main factory ---

/** Maximum serialized output size from a sandboxed tool (1 MB). */
export const MAX_OUTPUT_BYTES = 1_048_576

/**
 * Build all endowments for a Compartment based on declared permissions.
 * Only capabilities matching the permission groups are included.
 */
export function buildEndowments(
  permissions: ToolPermissions,
  envVars: Record<string, string | undefined>,
  pluginId = 'sandbox',
): Endowments {
  const endowments: Endowments = {
    console: createPluginConsole(pluginId),
  }

  if (permissions.time) {
    endowments.Date = Date
    endowments.Intl = Intl
  }

  if (permissions.network?.length) {
    endowments.fetch = createScopedFetch(permissions.network)
  }

  if (permissions.env?.length) {
    endowments.env = createScopedEnv(permissions.env, envVars)
  }

  if (permissions.fs?.length) {
    endowments.readFile = createScopedReadFile(permissions.fs)
  }

  if (permissions.random) {
    endowments.Math = harden({ random: () => Math.random() })
  }

  return endowments
}
