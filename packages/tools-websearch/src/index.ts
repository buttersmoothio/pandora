import type { ToolPlugin } from '@pandora/core/tools'
import { resolveSearchTools } from './resolve'

export type { SearchToolsResult } from './resolve'
export { loadBackend, loadFirstAvailable, resolveSearchTools } from './resolve'

export default {
  id: 'tools-websearch',
  name: 'Web Search',
  schemaVersion: 1,
  envVars: [
    { name: 'TAVILY_API_KEY', required: false },
    { name: 'BRAVE_API_KEY', required: false },
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
        { value: 'brave', label: 'Brave Search' },
        { value: 'exa', label: 'Exa' },
        { value: 'perplexity', label: 'Perplexity Search' },
      ],
    },
  ],
  tools: [],
  async getTools({ model, pluginConfig, env }) {
    const preferred = pluginConfig?.searchBackend as string | undefined
    const result = await resolveSearchTools({ model, preferred, env })
    return { tools: result.tools ?? {}, alerts: result.alerts }
  },
} satisfies ToolPlugin
