import type { ConfigStore } from '../config-store'

const CONFIG_KEY = 'pandora:config'

/**
 * Redis/KV-based config store for Upstash.
 *
 * This class has zero driver-specific imports - callers provide
 * a generic redis-like object with get/set/del methods.
 */
export class RedisConfigStore<T = unknown> implements ConfigStore<T> {
  constructor(
    private redis: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<unknown>
      del: (key: string) => Promise<unknown>
    },
  ) {}

  async get(): Promise<T | null> {
    const value = await this.redis.get(CONFIG_KEY)
    if (!value) {
      return null
    }
    return (typeof value === 'string' ? JSON.parse(value) : value) as T
  }

  async set(config: T): Promise<void> {
    await this.redis.set(CONFIG_KEY, JSON.stringify(config))
  }

  async delete(): Promise<void> {
    await this.redis.del(CONFIG_KEY)
  }
}
