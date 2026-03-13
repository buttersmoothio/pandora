import { describe, expect, it } from 'vitest'

// biome-ignore lint/nursery/useExplicitType: dynamic import type is inferred
const { agent } = await import('../research')

describe('research agent', () => {
  it('exports a plain agent definition', () => {
    expect(agent.id).toBe('research')
    expect(agent.name).toBe('Deep Research')
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
