const EXA_API_URL = 'https://api.exa.ai/search'

export function exaSearch({ apiKey }: { apiKey: string }) {
  return {
    id: 'web_search' as const,
    name: 'Web Search',
    description: 'Search the web using Exa for current information, news, and facts.',
    parameters: {
      type: 'object' as const,
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
    execute: async (input: { query: string; num_results?: number }) => {
      const response = await fetch(EXA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          query: input.query,
          num_results: input.num_results ?? 5,
          contents: { text: true },
        }),
      })

      if (!response.ok) {
        throw new Error(`Exa API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        results?: { title: string; url: string; text?: string }[]
      }
      return (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.text ?? '',
      }))
    },
  }
}
