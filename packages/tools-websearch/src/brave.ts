import { tool } from 'ai'
import { z } from 'zod'

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'

export function braveSearch({ apiKey }: { apiKey: string }) {
  return tool({
    description: 'Search the web using Brave Search for current information, news, and facts.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
      count: z.number().int().min(1).max(20).optional().describe('Number of results (max 20)'),
      freshness: z
        .enum(['pd', 'pw', 'pm', 'py'])
        .optional()
        .describe('Time filter: pd=24h, pw=7d, pm=31d, py=1yr'),
    }),
    execute: async (input) => {
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
  })
}
