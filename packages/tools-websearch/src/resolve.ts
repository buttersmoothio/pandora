import type { Alert, ToolRecord } from '@pandora/core/tools'

interface SearchBackend {
  id: string
  name: string
  envVar: string
  load: (env: Record<string, string | undefined>) => Promise<ToolRecord>
}

export interface SearchToolsResult {
  tools: ToolRecord | null
  alerts: Alert[]
}

const backends: SearchBackend[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    envVar: 'TAVILY_API_KEY',
    load: async (env) => {
      const { tavilySearch } = await import('@tavily/ai-sdk')
      return { webSearch: tavilySearch({ apiKey: env.TAVILY_API_KEY }) }
    },
  },
  {
    id: 'exa',
    name: 'Exa',
    envVar: 'EXA_API_KEY',
    load: async (env) => {
      const { webSearch } = await import('@exalabs/ai-sdk')
      return { webSearch: webSearch({ apiKey: env.EXA_API_KEY }) }
    },
  },
  {
    id: 'perplexity',
    name: 'Perplexity Search',
    envVar: 'PERPLEXITY_API_KEY',
    load: async (env) => {
      const { perplexitySearch } = await import('@perplexity-ai/ai-sdk')
      return { webSearch: perplexitySearch({ apiKey: env.PERPLEXITY_API_KEY }) }
    },
  },
]

/** Load a specific backend by ID. Returns tools and name, or null if env var missing or SDK not installed. */
export async function loadBackend(
  id: string,
  env: Record<string, string | undefined>,
): Promise<{ tools: ToolRecord; name: string } | null> {
  const backend = backends.find((b) => b.id === id)
  if (!(backend && env[backend.envVar])) return null
  try {
    const tools = await backend.load(env)
    return { tools, name: backend.name }
  } catch {
    return null
  }
}

/** Load the first available backend by env var presence. */
export async function loadFirstAvailable(
  env: Record<string, string | undefined>,
): Promise<{ tools: ToolRecord; name: string } | null> {
  for (const backend of backends) {
    const result = await loadBackend(backend.id, env)
    if (result) return result
  }
  return null
}

/** Try loading a native search tool based on the model provider. */
async function loadNativeSearch(
  model: string,
  provider: string,
): Promise<{ tools: ToolRecord; message: string } | null> {
  if (provider.startsWith('perplexity/')) {
    return { tools: {}, message: 'Using Perplexity built-in search' }
  }

  if (provider.startsWith('openai/')) {
    try {
      const { openai } = await import('@ai-sdk/openai')
      return {
        tools: { web_search: openai.tools.webSearch({}) },
        message: 'Using OpenAI native search',
      }
    } catch {
      /* SDK not installed */
    }
  }

  if (provider.startsWith('google/')) {
    // Vercel gateway routes through Vertex AI; direct google/ uses the Google Generative AI SDK
    try {
      if (model.startsWith('vercel/')) {
        const { vertex } = await import('@ai-sdk/google-vertex')
        return {
          tools: { google_search: vertex.tools.googleSearch({}) },
          message: 'Using Google Vertex native search',
        }
      }
      const { google } = await import('@ai-sdk/google')
      return {
        tools: { google_search: google.tools.googleSearch({}) },
        message: 'Using Google native search',
      }
    } catch {
      /* SDK not installed */
    }
  }

  if (provider.startsWith('anthropic/')) {
    try {
      const { anthropic } = await import('@ai-sdk/anthropic')
      return {
        tools: { web_search: anthropic.tools.webSearch_20250305() },
        message: 'Using Anthropic native search',
      }
    } catch {
      /* SDK not installed */
    }
  }

  return null
}

/**
 * Resolve search tools using the full priority chain:
 * 1. User's preferred backend (if explicitly set and available)
 * 2. Native model search (Perplexity → {}, OpenAI → webSearch, Google → googleSearch, Anthropic → webSearch)
 * 3. First available search API backend by env var
 * 4. null — no search capability
 */
export async function resolveSearchTools(opts: {
  model: string
  preferred?: string
  env: Record<string, string | undefined>
}): Promise<SearchToolsResult> {
  const { model, preferred, env } = opts
  const alerts: Alert[] = []

  // If user explicitly picked a tool-based backend, try that first
  if (preferred && preferred !== 'auto') {
    const result = await loadBackend(preferred, env)
    if (result) {
      alerts.push({ level: 'info', message: `Using ${result.name} for web search` })
      return { tools: result.tools, alerts }
    }
    // Fall through to auto-detect
  }

  // Native search: model has built-in web search
  // Strip optional "vercel/" gateway prefix (e.g. "vercel/openai/gpt-4o" → "openai/gpt-4o")
  const provider = model.replace(/^vercel\//, '')
  const native = await loadNativeSearch(model, provider)
  if (native) {
    alerts.push({ level: 'info', message: native.message })
    return { tools: native.tools, alerts }
  }

  // Tool-based fallback: first available search API
  const backendResult = await loadFirstAvailable(env)
  if (backendResult) {
    alerts.push({ level: 'info', message: `Using ${backendResult.name} for web search` })
    return { tools: backendResult.tools, alerts }
  }

  // No search capability available
  alerts.push({
    level: 'warning',
    message:
      'No search backend available. Set a search API key (Tavily, Exa, or Perplexity) or switch to a model with native search (OpenAI, Google, Anthropic, Perplexity).',
  })
  return { tools: null, alerts }
}
