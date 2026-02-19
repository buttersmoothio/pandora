import type { InArgs } from '@libsql/client'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from './config'
import {
  ConfigSchema,
  clearConfigCache,
  DEFAULTS,
  getConfig,
  resetConfig,
  updateConfig,
} from './config'
import type { ConfigStore } from './storage/config-store'
import { SQLConfigStore } from './storage/config-stores/sql'

describe('Config', () => {
  let configStore: ConfigStore<Config>

  beforeEach(async () => {
    // Create in-memory LibSQL client for each test
    const client = createClient({ url: ':memory:' })
    configStore = new SQLConfigStore(async (sql, params) => {
      const result = await client.execute(params ? { sql, args: params as InArgs } : sql)
      return result.rows as unknown[]
    }, 'sqlite')
    await configStore.init?.()
  })

  afterEach(async () => {
    clearConfigCache()
    await resetConfig(configStore)
  })

  describe('ConfigSchema', () => {
    it('validates empty object with defaults', () => {
      const result = ConfigSchema.parse({})
      expect(result.identity.name).toBe('Pandora')
    })

    it('validates partial config', () => {
      const result = ConfigSchema.parse({
        identity: { name: 'CustomBot' },
      })
      expect(result.identity.name).toBe('CustomBot')
      expect(result.models.operator.provider).toBe('anthropic')
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
      })
      expect(config.identity.name).toBe('EnvBot')
    })

    it('does not override models from env vars', async () => {
      const config = await getConfig(configStore, {
        MODEL_PROVIDER: 'openai',
        MODEL_NAME: 'gpt-4',
      })
      expect(config.models.operator.provider).toBe('anthropic')
      expect(config.models.operator.model).toBe('claude-sonnet-4-20250514')
    })
  })

  describe('updateConfig', () => {
    it('merges partial updates', async () => {
      const updated = await updateConfig(configStore, {
        identity: { name: 'UpdatedBot' },
      })
      expect(updated.identity.name).toBe('UpdatedBot')
      expect(updated.models).toEqual(DEFAULTS.models)
    })

    it('persists updates in subsequent getConfig calls', async () => {
      clearConfigCache() // Clear to test persistence
      await updateConfig(configStore, {
        identity: { name: 'PersistentBot' },
      })
      clearConfigCache() // Clear cache to force reload from storage
      const config = await getConfig(configStore, {})
      expect(config.identity.name).toBe('PersistentBot')
    })
  })

  describe('resetConfig', () => {
    it('resets to defaults', async () => {
      await updateConfig(configStore, {
        identity: { name: 'TempBot' },
      })
      const reset = await resetConfig(configStore)
      expect(reset).toEqual(DEFAULTS)
    })

    it('clears cache', async () => {
      await updateConfig(configStore, {
        identity: { name: 'TempBot' },
      })
      await resetConfig(configStore)
      const config = await getConfig(configStore, {})
      expect(config.identity.name).toBe('Pandora')
    })
  })
})
