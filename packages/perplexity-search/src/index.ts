const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions'

export const tools = [
  {
    id: 'perplexity_search' as const,
    name: 'Perplexity Search',
    description: 'Search the web using Perplexity Sonar for current information, news, and facts.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
    execute: async (
      input: { query: string },
      context: {
        env: Record<string, string | undefined>
        logger: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
      },
    ) => {
      const { logger } = context
      const apiKey = context.env.PERPLEXITY_API_KEY
      logger.log(`Searching: "${input.query}"`)
      const response = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: input.query }],
        }),
      })

      if (!response.ok) {
        logger.error(`API error: ${response.status} ${response.statusText}`)
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
        citations?: string[]
      }

      const content = data.choices?.[0]?.message?.content ?? ''
      const citations = data.citations ?? []

      logger.log(`Got response with ${citations.length} citations`)
      return {
        answer: content,
        citations: citations.map((url, i) => ({
          title: `Source ${i + 1}`,
          url,
        })),
      }
    },
  },
]
