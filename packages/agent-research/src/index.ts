import type { AgentPlugin } from '@pandora/core/agents'
import { research } from './research'
import { webSearch } from './web-search'

export default {
  id: 'agent-research',
  name: 'Research',
  schemaVersion: 1,
  agents: [webSearch, research],
} satisfies AgentPlugin
