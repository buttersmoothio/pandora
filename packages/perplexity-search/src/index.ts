import type { Tool } from '@pandorakit/sdk/tools'

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions'

interface PerplexitySearchInput {
  query: string
}

interface PerplexitySearchResult {
  answer: string
  citations: { title: string; url: string }[]
}

const perplexitySearch: Tool<PerplexitySearchInput, PerplexitySearchResult> = {
  id: 'perplexity_search',
  name: 'Perplexity Search',
  description: 'Search the web using Perplexity Sonar for current information, news, and facts.',
  annotations: { readOnlyHint: true },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
  // biome-ignore lint/nursery/useExplicitType: input/context types inferred from Tool generic
  execute: async (input, context): Promise<PerplexitySearchResult> => {
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
}

export const tools: Tool<PerplexitySearchInput, PerplexitySearchResult>[] = [perplexitySearch]
