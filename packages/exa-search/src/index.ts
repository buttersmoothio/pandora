const EXA_API_URL = 'https://api.exa.ai/search'

export const tools = [
  {
    id: 'exa_search' as const,
    name: 'Exa Search',
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
    execute: async (
      input: { query: string; num_results?: number },
      context: { env: Record<string, string | undefined> },
    ) => {
      const apiKey = context.env.EXA_API_KEY
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
  },
]
