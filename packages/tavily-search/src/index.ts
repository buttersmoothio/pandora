import type { Tool } from '@pandorakit/sdk/tools'

const TAVILY_API_URL = 'https://api.tavily.com/search'

interface TavilySearchInput {
  query: string
  max_results?: number
  search_depth?: string
}

interface SearchResult {
  title: string
  url: string
  description: string
}

const tavilySearch: Tool<TavilySearchInput, SearchResult[]> = {
  id: 'tavily_search',
  name: 'Tavily Search',
  description: 'Search the web using Tavily for current information, news, and facts.',
  annotations: { readOnlyHint: true },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      max_results: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Number of results (max 10)',
      },
      search_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Search depth: basic (faster) or advanced (more thorough)',
      },
    },
    required: ['query'],
  },
  // biome-ignore lint/nursery/useExplicitType: input/context types inferred from Tool generic
  execute: async (input, context): Promise<SearchResult[]> => {
    const { logger } = context
    const apiKey = context.env.TAVILY_API_KEY
    logger.log(`Searching: "${input.query}"`)
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: input.query,
        max_results: input.max_results ?? 5,
        search_depth: input.search_depth ?? 'basic',
      }),
    })

    if (!response.ok) {
      logger.error(`API error: ${response.status} ${response.statusText}`)
      throw new Error(`Tavily API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      results?: { title: string; url: string; content: string }[]
    }
    const results = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.content,
    }))
    logger.log(`Found ${results.length} results`)
    return results
  },
}

export const tools: Tool<TavilySearchInput, SearchResult[]>[] = [tavilySearch]
