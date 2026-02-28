import { describe, expect, it } from 'vitest'

const { agent } = await import('./web-search')

describe('web-search agent', () => {
  it('exports a plain agent definition', () => {
    expect(agent.id).toBe('web-search')
    expect(agent.name).toBe('Web Search')
    expect(agent.description).toBeDefined()
    expect(agent.instructions).toBeDefined()
  })

  it('has no getTools hook (tool deps come from manifest)', () => {
    expect(agent).not.toHaveProperty('getTools')
  })

  it('has no tools array (global tools injected via useTools)', () => {
    expect(agent).not.toHaveProperty('tools')
  })
})
