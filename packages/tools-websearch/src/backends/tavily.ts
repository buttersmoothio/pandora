const TAVILY_API_URL = 'https://api.tavily.com/search'

export function tavilySearch({ apiKey }: { apiKey: string }) {
  return {
    id: 'web_search' as const,
    name: 'Web Search',
    description: 'Search the web using Tavily for current information, news, and facts.',
    parameters: {
      type: 'object' as const,
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
    execute: async (input: { query: string; max_results?: number; search_depth?: string }) => {
      const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: input.max_results ?? 5,
          search_depth: input.search_depth ?? 'basic',
        }),
      })

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        results?: { title: string; url: string; content: string }[]
      }
      return (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.content,
      }))
    },
  }
}
