const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'

export function braveSearch({ apiKey }: { apiKey: string }) {
  return {
    id: 'web_search' as const,
    name: 'Web Search',
    description: 'Search the web using Brave Search for current information, news, and facts.',
    parameters: {
      type: 'object' as const,
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
    execute: async (input: { query: string; count?: number; freshness?: string }) => {
      const params = new URLSearchParams({ q: input.query })
      if (input.count) params.set('count', String(input.count))
      if (input.freshness) params.set('freshness', input.freshness)

      const response = await fetch(`${BRAVE_API_URL}?${params}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        web?: { results?: { title: string; url: string; description: string }[] }
      }
      return (data.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      }))
    },
  }
}
