import type { Tool } from '@pandorakit/sdk/tools'

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'

interface BraveSearchInput {
  query: string
  count?: number
  freshness?: string
}

interface SearchResult {
  title: string
  url: string
  description: string
}

const braveSearch: Tool<BraveSearchInput, SearchResult[]> = {
  id: 'brave_search',
  name: 'Brave Search',
  description: 'Search the web using Brave Search for current information, news, and facts.',
  annotations: { readOnlyHint: true },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      count: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Number of results (max 20)',
      },
      freshness: {
        type: 'string',
        enum: ['pd', 'pw', 'pm', 'py'],
        description: 'Time filter: pd=24h, pw=7d, pm=31d, py=1yr',
      },
    },
    required: ['query'],
  },
  // biome-ignore lint/nursery/useExplicitType: input/context types inferred from Tool generic
  execute: async (input, context): Promise<SearchResult[]> => {
    const { logger } = context
    const apiKey = context.env.BRAVE_API_KEY
    const params = new URLSearchParams({ q: input.query })
    if (input.count) {
      params.set('count', String(input.count))
    }
    if (input.freshness) {
      params.set('freshness', input.freshness)
    }

    logger.log(`Searching: "${input.query}"`)
    const response = await fetch(`${BRAVE_API_URL}?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey as string,
      },
    })

    if (!response.ok) {
      logger.error(`API error: ${response.status} ${response.statusText}`)
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      web?: { results?: { title: string; url: string; description: string }[] }
    }
    const results = (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }))
    logger.log(`Found ${results.length} results`)
    return results
  },
}

export const tools: Tool<BraveSearchInput, SearchResult[]>[] = [braveSearch]
