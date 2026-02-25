import type { ToolPlugin } from '@pandora/core/tools'
import { resolveSearchTools } from './resolve'

export { loadBackend, loadFirstAvailable, resolveSearchTools } from './resolve'

export default {
  id: 'tools-websearch',
  name: 'Web Search',
  schemaVersion: 1,
  envVars: [
    { name: 'TAVILY_API_KEY', required: false },
    { name: 'EXA_API_KEY', required: false },
    { name: 'PERPLEXITY_API_KEY', required: false },
  ],
  configFields: [
    {
      key: 'searchBackend',
      label: 'Search Backend',
      type: 'enum',
      description: 'Preferred search backend. "Auto" detects from model and available API keys.',
      options: [
        { value: 'auto', label: 'Auto-detect' },
        { value: 'tavily', label: 'Tavily' },
        { value: 'exa', label: 'Exa' },
        { value: 'perplexity', label: 'Perplexity Search' },
      ],
    },
  ],
  tools: [],
  async getTools({ model, pluginConfig, env }) {
    const preferred = pluginConfig?.searchBackend as string | undefined
    return (await resolveSearchTools({ model, preferred, env })) ?? {}
  },
  async getWarnings({ model, env }) {
    const provider = model.replace(/^vercel\//, '')
    if (
      provider.startsWith('perplexity/') ||
      provider.startsWith('openai/') ||
      provider.startsWith('google/') ||
      provider.startsWith('anthropic/')
    ) {
      return []
    }
    if (env.TAVILY_API_KEY || env.EXA_API_KEY || env.PERPLEXITY_API_KEY) {
      return []
    }
    return [
      'No search backend available. Set a search API key (Tavily, Exa, or Perplexity) or switch to a model with native search (OpenAI, Google, Anthropic, Perplexity).',
    ]
  },
} satisfies ToolPlugin
