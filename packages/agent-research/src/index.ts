import type { AgentPlugin } from '@pandora/core/agents'
import { webSearch } from './web-search'

export default {
  id: 'agent-research',
  name: 'Research',
  schemaVersion: 1,
  agents: [webSearch],
} satisfies AgentPlugin
