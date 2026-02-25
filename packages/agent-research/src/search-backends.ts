interface SearchBackend {
  id: string
  name: string
  envVar: string
  load: (env: Record<string, string | undefined>) => Promise<Record<string, unknown>>
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

/** Load a specific backend by ID. Returns null if env var missing or SDK not installed. */
export async function loadBackend(
  id: string,
  env: Record<string, string | undefined>,
): Promise<Record<string, unknown> | null> {
  const backend = backends.find((b) => b.id === id)
  if (!(backend && env[backend.envVar])) return null
  try {
    return await backend.load(env)
  } catch {
    return null
  }
}

/** Load the first available backend by env var presence. */
export async function loadFirstAvailable(
  env: Record<string, string | undefined>,
): Promise<Record<string, unknown> | null> {
  for (const backend of backends) {
    const tools = await loadBackend(backend.id, env)
    if (tools) return tools
  }
  return null
}
