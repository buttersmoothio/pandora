import { describe, expect, it } from 'vitest'
import type { UnifiedPluginInfo } from './use-plugins'
import { buildToolNameMap, sanitiseToolId } from './use-plugins'

// ---------------------------------------------------------------------------
// sanitiseToolId
// ---------------------------------------------------------------------------

describe('sanitiseToolId', () => {
  it('replaces @ with underscore', () => {
    expect(sanitiseToolId('@pandorakit/search')).toBe('_pandorakit_search')
  })

  it('replaces / with underscore', () => {
    expect(sanitiseToolId('scope/name')).toBe('scope_name')
  })

  it('replaces : with underscore', () => {
    expect(sanitiseToolId('plugin:tool')).toBe('plugin_tool')
  })

  it('handles full namespaced tool ID', () => {
    expect(sanitiseToolId('@pandorakit/brave-search:brave_search')).toBe(
      '_pandorakit_brave-search_brave_search',
    )
  })

  it('preserves alphanumeric, underscore, and hyphen', () => {
    expect(sanitiseToolId('my-tool_v2')).toBe('my-tool_v2')
  })

  it('replaces multiple special chars', () => {
    expect(sanitiseToolId('a.b+c=d')).toBe('a_b_c_d')
  })
})

// ---------------------------------------------------------------------------
// buildToolNameMap
// ---------------------------------------------------------------------------

function makePlugin(overrides: Partial<UnifiedPluginInfo>): UnifiedPluginInfo {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    envVars: [],
    envConfigured: true,
    configFields: [],
    enabled: true,
    config: {},
    provides: {},
    validationErrors: [],
    ...overrides,
  }
}

describe('buildToolNameMap', () => {
  it('maps sanitised tool IDs to tool names', () => {
    const plugin = makePlugin({
      provides: {
        tools: {
          toolIds: ['@pandorakit/search:web_search'],
          tools: [{ id: '@pandorakit/search:web_search', name: 'Web Search', description: '' }],
          alerts: [],
        },
      },
    })

    const map = buildToolNameMap([plugin])
    expect(map.get('_pandorakit_search_web_search')).toBe('Web Search')
  })

  it('maps agent IDs with agent- prefix', () => {
    const plugin = makePlugin({
      provides: {
        agents: {
          agentIds: ['@pandorakit/research:research'],
          agents: [
            {
              id: '@pandorakit/research:research',
              name: 'Research Agent',
              description: '',
              tools: [],
              alerts: [],
            },
          ],
          alerts: [],
        },
      },
    })

    const map = buildToolNameMap([plugin])
    expect(map.get('agent-_pandorakit_research_research')).toBe('Research Agent')
  })

  it('handles plugins with both tools and agents', () => {
    const plugin = makePlugin({
      provides: {
        tools: {
          toolIds: ['p:tool1'],
          tools: [{ id: 'p:tool1', name: 'Tool One', description: '' }],
          alerts: [],
        },
        agents: {
          agentIds: ['p:agent1'],
          agents: [{ id: 'p:agent1', name: 'Agent One', description: '', tools: [], alerts: [] }],
          alerts: [],
        },
      },
    })

    const map = buildToolNameMap([plugin])
    expect(map.get('p_tool1')).toBe('Tool One')
    expect(map.get('agent-p_agent1')).toBe('Agent One')
  })

  it('handles multiple plugins', () => {
    const plugins = [
      makePlugin({
        provides: {
          tools: {
            toolIds: ['a:t1'],
            tools: [{ id: 'a:t1', name: 'Alpha', description: '' }],
            alerts: [],
          },
        },
      }),
      makePlugin({
        provides: {
          tools: {
            toolIds: ['b:t2'],
            tools: [{ id: 'b:t2', name: 'Beta', description: '' }],
            alerts: [],
          },
        },
      }),
    ]

    const map = buildToolNameMap(plugins)
    expect(map.get('a_t1')).toBe('Alpha')
    expect(map.get('b_t2')).toBe('Beta')
  })

  it('skips plugins without tools or agents', () => {
    const plugin = makePlugin({ provides: {} })
    const map = buildToolNameMap([plugin])
    expect(map.size).toBe(0)
  })

  it('returns empty map for empty input', () => {
    expect(buildToolNameMap([]).size).toBe(0)
  })
})
