import type { InArgs } from '@libsql/client'
import { createClient } from '@libsql/client'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Config } from './config'
import { ConfigSchema, DEFAULTS, getConfig, resetConfig, updateConfig } from './config'
import type { ConfigStore } from './storage/config-store'
import { SQLConfigStore } from './storage/providers/sql'

describe('Config', () => {
  let configStore: ConfigStore<Config>

  beforeEach(async () => {
    const client = createClient({ url: ':memory:' })
    configStore = new SQLConfigStore(async (sql, params) => {
      const result = await client.execute(params ? { sql, args: params as InArgs } : sql)
      return result.rows as unknown[]
    }, 'sqlite')
    await configStore.init?.()
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
    it('returns defaults when storage is empty', async () => {
      const config = await getConfig(configStore)
      expect(config).toEqual(DEFAULTS)
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
      await updateConfig(configStore, {
        identity: { name: 'PersistentBot' },
      })
      const config = await getConfig(configStore)
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

    it('returns defaults after reset', async () => {
      await updateConfig(configStore, {
        identity: { name: 'TempBot' },
      })
      await resetConfig(configStore)
      const config = await getConfig(configStore)
      expect(config.identity.name).toBe('Pandora')
    })

    it('preserves plugin configs through reset', async () => {
      await updateConfig(configStore, {
        identity: { name: 'TempBot' },
        plugins: { 'my-plugin': { enabled: true, apiKey: 'keep-me' } },
      })
      const reset = await resetConfig(configStore)
      expect(reset.identity.name).toBe('Pandora') // reset
      expect(reset.plugins['my-plugin']).toEqual({ enabled: true, apiKey: 'keep-me' }) // preserved
    })
  })

  describe('updateConfig validation', () => {
    it('rejects invalid model config', async () => {
      await expect(
        updateConfig(configStore, {
          models: { operator: { provider: '', model: '' } },
        }),
      ).rejects.toThrow()
    })
  })

  describe('deepMerge via updateConfig', () => {
    it('deep merges nested objects', async () => {
      await updateConfig(configStore, {
        models: { operator: { provider: 'openai', model: 'gpt-4o' } },
      })
      const config = await getConfig(configStore)
      expect(config.models.operator.provider).toBe('openai')
      expect(config.models.operator.model).toBe('gpt-4o')
    })

    it('null value deletes the key', async () => {
      await updateConfig(configStore, {
        plugins: { 'test-plugin': { enabled: true } },
      })
      // Delete the key by setting to null
      await updateConfig(configStore, {
        plugins: { 'test-plugin': null },
      } as never)
      const config = await getConfig(configStore)
      expect(config.plugins['test-plugin']).toBeUndefined()
    })
  })
})
