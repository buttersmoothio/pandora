import { braveSearch } from './backends/brave'
import { exaSearch } from './backends/exa'
import { perplexitySearch } from './backends/perplexity'
import { tavilySearch } from './backends/tavily'

interface Alert {
  level: 'info' | 'warning'
  message: string
}

interface SearchToolExport {
  id: string
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (input: never, context: { env: Record<string, string | undefined> }) => Promise<unknown>
}

interface SearchBackend {
  id: string
  name: string
  envVar: string
  load: (env: Record<string, string | undefined>) => SearchToolExport
}

export interface SearchToolResult {
  tool: SearchToolExport | null
  alerts: Alert[]
}

const backends: SearchBackend[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    envVar: 'TAVILY_API_KEY',
    load: (env) => tavilySearch({ apiKey: env.TAVILY_API_KEY as string }),
  },
  {
    id: 'exa',
    name: 'Exa',
    envVar: 'EXA_API_KEY',
    load: (env) => exaSearch({ apiKey: env.EXA_API_KEY as string }),
  },
  {
    id: 'brave',
    name: 'Brave Search',
    envVar: 'BRAVE_API_KEY',
    load: (env) => braveSearch({ apiKey: env.BRAVE_API_KEY as string }),
  },
  {
    id: 'perplexity',
    name: 'Perplexity Search',
    envVar: 'PERPLEXITY_API_KEY',
    load: (env) => perplexitySearch({ apiKey: env.PERPLEXITY_API_KEY as string }),
  },
]

/** Load a specific backend by ID. Returns ToolExport and name, or null if env var missing. */
export function loadBackend(
  id: string,
  env: Record<string, string | undefined>,
): { tool: SearchToolExport; name: string } | null {
  const backend = backends.find((b) => b.id === id)
  if (!(backend && env[backend.envVar])) return null
  try {
    const tool = backend.load(env)
    return { tool, name: backend.name }
  } catch {
    return null
  }
}

/** Load the first available backend by env var presence. */
export function loadFirstAvailable(
  env: Record<string, string | undefined>,
): { tool: SearchToolExport; name: string } | null {
  for (const backend of backends) {
    const result = loadBackend(backend.id, env)
    if (result) return result
  }
  return null
}

/**
 * Resolve a search tool using the priority chain:
 * 1. User's preferred backend (if explicitly set and available)
 * 2. First available search API backend by env var
 * 3. null — no search capability
 */
export function resolveSearchTool(opts: {
  preferred?: string
  env: Record<string, string | undefined>
}): SearchToolResult {
  const { preferred, env } = opts
  const alerts: Alert[] = []

  // If user explicitly picked a backend, try that first
  if (preferred && preferred !== 'auto') {
    const result = loadBackend(preferred, env)
    if (result) {
      alerts.push({ level: 'info', message: `Using ${result.name} for web search` })
      return { tool: result.tool, alerts }
    }
    // Fall through to auto-detect
  }

  // Tool-based fallback: first available search API
  const backendResult = loadFirstAvailable(env)
  if (backendResult) {
    alerts.push({ level: 'info', message: `Using ${backendResult.name} for web search` })
    return { tool: backendResult.tool, alerts }
  }

  // No search capability available
  alerts.push({
    level: 'warning',
    message:
      'No search backend available. Set a search API key (Tavily, Brave, Exa, or Perplexity).',
  })
  return { tool: null, alerts }
}
