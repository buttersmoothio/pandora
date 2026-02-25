import type { ToolPlugin } from '@pandora/core/tools'
import { resolveSearchTools } from './resolve'

export { loadBackend, loadFirstAvailable, resolveSearchTools } from './resolve'

export default {
  id: 'tools-websearch',
  name: 'Web Search',
  schemaVersion: 1,
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
} satisfies ToolPlugin
