import { defineAgent } from '@pandora/core/agents'
import { loadBackend, loadFirstAvailable } from './search-backends'

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

    // If user explicitly picked a tool-based backend, try that first
    if (preferred && preferred !== 'auto') {
      const tools = await loadBackend(preferred, env)
      if (tools) return tools
      // Fall through to auto-detect
    }

    // Native search: model has built-in web search
    if (model.startsWith('perplexity/')) {
      return {} // Search is built-in, no tools needed
    }

    if (model.startsWith('openai/')) {
      try {
        const { openai } = await import('@ai-sdk/openai')
        return { web_search: openai.tools.webSearch({}) }
      } catch {
        /* SDK not installed */
      }
    }

    if (model.startsWith('google/')) {
      try {
        const { google } = await import('@ai-sdk/google')
        return { google_search: google.tools.googleSearch({}) }
      } catch {
        /* SDK not installed */
      }
    }

    // Tool-based fallback: first available search API
    const backendTools = await loadFirstAvailable(env)
    if (backendTools) return backendTools

    // No search capability available — don't load the agent
    return null
  },
})
