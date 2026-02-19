import { UpstashStore } from '@mastra/upstash'
import type { Config, StorageFactory } from '@pandora/core/storage'
import { RedisAuthStore, RedisConfigStore } from '@pandora/core/storage'
import { Redis } from '@upstash/redis'

export const createStorage: StorageFactory = async (env) => {
  if (!env.UPSTASH_URL) {
    throw new Error('UPSTASH_URL is required for Upstash storage')
  }
  if (!env.UPSTASH_TOKEN) {
    throw new Error('UPSTASH_TOKEN is required for Upstash storage')
  }

  const redis = new Redis({
    url: env.UPSTASH_URL,
    token: env.UPSTASH_TOKEN,
  })

  const mastra = new UpstashStore({
    id: 'pandora-upstash',
    client: redis,
  })

  const config = new RedisConfigStore<Config>(redis)
  const auth = new RedisAuthStore(redis)

  return { mastra, config, auth }
}
