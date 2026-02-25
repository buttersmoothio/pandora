import type { AgentPlugin } from '@pandora/core/agents'
import { webSearch } from './web-search'

export default {
  id: 'agent-research',
  name: 'Research',
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
  agents: [webSearch],
} satisfies AgentPlugin
