import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../config'
import { loadChannels } from './load-channels'
import type { RegisteredPlugin } from './plugin-registry'
import { createPluginRegistry } from './plugin-registry'

function configWith(...pluginIds: string[]) {
  const plugins: Record<string, { enabled: boolean }> = {}
  for (const id of pluginIds) plugins[id] = { enabled: true }
  return { ...DEFAULTS, plugins }
}

function makeChannelPlugin(overrides?: Partial<RegisteredPlugin>): RegisteredPlugin {
  return {
    id: 'channel-test',
    name: 'Test Channel',
    envVars: [],
    configFields: [],
    channels: {
      factory: (env) =>
        env.TEST_TOKEN
          ? { id: 'test', name: 'Test', realtime: { start: async () => {}, stop: async () => {} } }
          : null,
    },
    ...overrides,
  }
}

describe('loadChannels', () => {
  it('loads channels from enabled plugins with env vars', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('channel-test', makeChannelPlugin())

    const { channels, channelNames } = await loadChannels(registry, configWith('channel-test'), {
      TEST_TOKEN: 'abc',
    })
    expect(channels.get('channel-test:test')).toBeDefined()
    expect(channels.get('channel-test:test')?.name).toBe('Test')
    expect(channelNames.get('Test')).toBe('channel-test:test')
  })

  it('skips channels when factory returns null', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('channel-test', makeChannelPlugin())

    const { channels } = await loadChannels(registry, DEFAULTS, {})
    expect(channels.size).toBe(0)
  })

  it('skips disabled channel plugins', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('channel-test', makeChannelPlugin())

    const config = { ...DEFAULTS, plugins: { 'channel-test': { enabled: false } } }
    const { channels } = await loadChannels(registry, config, { TEST_TOKEN: 'abc' })
    expect(channels.size).toBe(0)
  })

  it('skips plugins without channels capability', async () => {
    const registry = createPluginRegistry()
    registry.plugins.set('tools-only', {
      id: 'tools-only',
      name: 'Tools Only',
      envVars: [],
      configFields: [],
      tools: { entries: [], manifests: new Map() },
    })

    const { channels } = await loadChannels(registry, DEFAULTS, {})
    expect(channels.size).toBe(0)
  })
})
