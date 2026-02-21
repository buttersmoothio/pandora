import { UpstashStore } from '@mastra/upstash'
import type { Config, StorageFactory, StoragePlugin } from '@pandora/core/storage'
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
  // @upstash/redis has stricter discriminated-union opts for set(); the
  // runtime signatures are compatible, so a widening cast is safe here.
  const auth = new RedisAuthStore(redis as ConstructorParameters<typeof RedisAuthStore>[0])

  return { mastra, config, auth }
}

export default {
  id: 'storage-upstash',
  schemaVersion: 1,
  factory: createStorage,
} satisfies StoragePlugin
