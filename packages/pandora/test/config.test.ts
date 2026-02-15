import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ConfigSchema,
  clearConfigCache,
  DEFAULTS,
  getConfig,
  resetConfig,
  updateConfig,
} from '../src/config'
import type { ConfigStore } from '../src/storage/config-store'
import { createLibSQLConfigStore } from '../src/storage/config-store'

describe('Config', () => {
  let configStore: ConfigStore

  beforeEach(async () => {
    // Create in-memory LibSQL client for each test
    const client = createClient({ url: ':memory:' })
    configStore = createLibSQLConfigStore(client)
    await configStore.init?.()
  })

  afterEach(async () => {
    clearConfigCache()
    await resetConfig(configStore)
  })

  describe('DEFAULTS', () => {
    it('has correct identity defaults', () => {
      expect(DEFAULTS.identity.name).toBe('Pandora')
      expect(DEFAULTS.identity.description).toBe('A multi-channel AI assistant')
      expect(DEFAULTS.identity.version).toBe('0.1.0')
    })

    it('has correct personality defaults', () => {
      expect(DEFAULTS.personality.traits).toEqual(['helpful', 'concise', 'friendly'])
    })

    it('has correct model defaults', () => {
      expect(DEFAULTS.models.default.provider).toBe('anthropic')
      expect(DEFAULTS.models.default.model).toBe('claude-sonnet-4-20250514')
    })

    it('has correct memory defaults', () => {
      expect(DEFAULTS.memory.enabled).toBe(true)
      expect(DEFAULTS.memory.maxThreads).toBe(100)
      expect(DEFAULTS.memory.maxMessagesPerThread).toBe(1000)
    })

    it('has correct channel defaults', () => {
      expect(DEFAULTS.channels.telegram.enabled).toBe(false)
      expect(DEFAULTS.channels.discord.enabled).toBe(false)
      expect(DEFAULTS.channels.slack.enabled).toBe(false)
      expect(DEFAULTS.channels.web.enabled).toBe(true)
    })

    it('has correct security defaults', () => {
      expect(DEFAULTS.security.allowedOrigins).toEqual(['*'])
      expect(DEFAULTS.security.rateLimiting.enabled).toBe(false)
      expect(DEFAULTS.security.apiKeys.required).toBe(false)
    })
  })

  describe('ConfigSchema', () => {
    it('validates empty object with defaults', () => {
      const result = ConfigSchema.parse({})
      expect(result.identity.name).toBe('Pandora')
    })

    it('validates partial config', () => {
      const result = ConfigSchema.parse({
        identity: { name: 'CustomBot', description: 'A custom bot', version: '1.0.0' },
      })
      expect(result.identity.name).toBe('CustomBot')
      expect(result.models.default.provider).toBe('anthropic')
    })

    it('rejects invalid model temperature', () => {
      expect(() =>
        ConfigSchema.parse({
          models: {
            default: {
              provider: 'anthropic',
              model: 'test',
              temperature: 3, // Invalid: > 2
            },
          },
        }),
      ).toThrow()
    })
  })

  describe('getConfig', () => {
    it('returns defaults when no env vars', async () => {
      const config = await getConfig(configStore, {})
      expect(config).toEqual(DEFAULTS)
    })

    it('applies env var overrides', async () => {
      const config = await getConfig(configStore, {
        PANDORA_NAME: 'EnvBot',
        MODEL_PROVIDER: 'openai',
        MODEL_NAME: 'gpt-4',
      })
      expect(config.identity.name).toBe('EnvBot')
      expect(config.models.default.provider).toBe('openai')
      expect(config.models.default.model).toBe('gpt-4')
    })

    it('applies telegram channel from env', async () => {
      const config = await getConfig(configStore, {
        TELEGRAM_BOT_TOKEN: 'test-token',
        TELEGRAM_WEBHOOK_SECRET: 'test-secret',
      })
      expect(config.channels.telegram.enabled).toBe(true)
      expect(config.channels.telegram.botToken).toBe('test-token')
      expect(config.channels.telegram.webhookSecret).toBe('test-secret')
    })

    it('applies discord channel from env', async () => {
      const config = await getConfig(configStore, {
        DISCORD_BOT_TOKEN: 'discord-token',
        DISCORD_APPLICATION_ID: 'app-id',
      })
      expect(config.channels.discord.enabled).toBe(true)
      expect(config.channels.discord.botToken).toBe('discord-token')
    })

    it('applies slack channel from env', async () => {
      const config = await getConfig(configStore, {
        SLACK_BOT_TOKEN: 'slack-token',
        SLACK_SIGNING_SECRET: 'signing-secret',
      })
      expect(config.channels.slack.enabled).toBe(true)
      expect(config.channels.slack.botToken).toBe('slack-token')
    })
  })

  describe('updateConfig', () => {
    it('merges partial updates', async () => {
      const updated = await updateConfig(configStore, {
        identity: { name: 'UpdatedBot', description: 'Updated', version: '2.0.0' },
      })
      expect(updated.identity.name).toBe('UpdatedBot')
      expect(updated.models).toEqual(DEFAULTS.models)
    })

    it('persists updates in subsequent getConfig calls', async () => {
      clearConfigCache() // Clear to test persistence
      await updateConfig(configStore, {
        identity: { name: 'PersistentBot', description: 'Persistent', version: '3.0.0' },
      })
      clearConfigCache() // Clear cache to force reload from storage
      const config = await getConfig(configStore, {})
      expect(config.identity.name).toBe('PersistentBot')
    })
  })

  describe('resetConfig', () => {
    it('resets to defaults', async () => {
      await updateConfig(configStore, {
        identity: { name: 'TempBot', description: 'Temp', version: '1.0.0' },
      })
      const reset = await resetConfig(configStore)
      expect(reset).toEqual(DEFAULTS)
    })

    it('clears cache', async () => {
      await updateConfig(configStore, {
        identity: { name: 'TempBot', description: 'Temp', version: '1.0.0' },
      })
      await resetConfig(configStore)
      const config = await getConfig(configStore, {})
      expect(config.identity.name).toBe('Pandora')
    })
  })
})
