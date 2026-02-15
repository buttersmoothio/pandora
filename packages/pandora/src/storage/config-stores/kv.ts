import type { Config, ConfigStore } from '../config-store'

const CONFIG_KEY = 'pandora:config'

/**
 * Redis/KV-based config store for Upstash.
 */
export class RedisConfigStore implements ConfigStore {
  constructor(
    private redis: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<unknown>
      del: (key: string) => Promise<unknown>
    },
  ) {}

  async get(): Promise<Config | null> {
    const value = await this.redis.get(CONFIG_KEY)
    if (!value) return null
    return (typeof value === 'string' ? JSON.parse(value) : value) as Config
  }

  async set(config: Config): Promise<void> {
    await this.redis.set(CONFIG_KEY, JSON.stringify(config))
  }

  async delete(): Promise<void> {
    await this.redis.del(CONFIG_KEY)
  }
}
