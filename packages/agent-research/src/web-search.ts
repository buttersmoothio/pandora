import { defineAgent } from '@pandora/core/agents'
import { resolveSearchTools } from '@pandora/tools-websearch'

export const webSearch = defineAgent({
  id: 'web-search',
  name: 'Web Search',
  description:
    'Search the web for current information. Handles real-time lookups, ' +
    'recent news, fact-checking, and research questions.',
  instructions: `You are a web search specialist with access to current web information.

When answering:
- Search for the most recent and relevant information
- Cite your sources with URLs when possible
- Clearly indicate when information might be outdated or uncertain
- For complex questions, refine your search if initial results are insufficient
- Synthesize results into a clear, concise answer`,

  async getTools({ model, pluginConfig, env }) {
    const preferred = pluginConfig?.searchBackend as string | undefined
    const result = await resolveSearchTools({ model, preferred, env })
    return { tools: result.tools, alerts: result.alerts }
  },
})
