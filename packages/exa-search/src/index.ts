import type { Tool } from '@pandorakit/sdk/tools'

const EXA_API_URL = 'https://api.exa.ai/search'

interface ExaSearchInput {
  query: string
  num_results?: number
}

interface SearchResult {
  title: string
  url: string
  description: string
}

const exaSearch: Tool<ExaSearchInput, SearchResult[]> = {
  id: 'exa_search',
  name: 'Exa Search',
  description: 'Search the web using Exa for current information, news, and facts.',
  annotations: { readOnlyHint: true },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      num_results: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Number of results (max 10)',
      },
    },
    required: ['query'],
  },
  // biome-ignore lint/nursery/useExplicitType: input/context types inferred from Tool generic
  execute: async (input, context): Promise<SearchResult[]> => {
    const { logger } = context
    const apiKey = context.env.EXA_API_KEY
    logger.log(`Searching: "${input.query}"`)
    const response = await fetch(EXA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey as string,
      },
      body: JSON.stringify({
        query: input.query,
        num_results: input.num_results ?? 5,
        contents: { text: true },
      }),
    })

    if (!response.ok) {
      logger.error(`API error: ${response.status} ${response.statusText}`)
      throw new Error(`Exa API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      results?: { title: string; url: string; text?: string }[]
    }
    const results = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.text ?? '',
    }))
    logger.log(`Found ${results.length} results`)
    return results
  },
}

export const tools: Tool<ExaSearchInput, SearchResult[]>[] = [exaSearch]
